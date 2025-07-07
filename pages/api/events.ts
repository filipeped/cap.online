import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import zlib from "zlib";

const PIXEL_ID = "703302575818162";
const ACCESS_TOKEN = "EAAQfmxkTTZCcBPMtbiRdOTtGC1LycYJsKXnFZCs3N04MsoBjbx5WdvaPhObbtmKg3iDZBJZAjAlpzqWAr80uEUsUSm95bVCODpzJSsC3X6gA9u6yPC3oDko8gUIMW2SA5C7MOsZBvmyVN72N38UcMKp8uGbQaPxe9r5r66H6PAXuZCieIl6gPIFU5c2ympRwZDZD";
const META_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

const RATE_LIMIT = 30;
const rateLimitMap = new Map();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip)!.filter((t: number) => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  if (rateLimitMap.size > 1000) {
    const oldestKey = rateLimitMap.keys().next().value;
    rateLimitMap.delete(oldestKey);
  }
  return true;
}

function isNonEmptyString(val: any) {
  return typeof val === "string" && val.trim().length > 0;
}

function isSha256(str: string) {
  return typeof str === "string" && /^[a-f0-9]{64}$/i.test(str);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "";

  console.log("🔄 Requisição recebida:", { ip, userAgent, contentLength: req.headers["content-length"] });

  const ALLOWED_ORIGINS = [
    "https://www.digitalpaisagismo.com.br",
    "https://cap.digitalpaisagismo.com.br",
    "http://localhost:3000"
  ];
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://www.digitalpaisagismo.com.br");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  if (!rateLimit(ip)) {
    console.log("⚠️ Rate limit excedido:", { ip });
    return res.status(429).json({ error: "Limite de requisições excedido", retry_after: 60 });
  }

  try {
    if (!req.body?.data || !Array.isArray(req.body.data)) {
      console.log("❌ Payload inválido:", req.body);
      return res.status(400).json({ error: "Payload inválido - campo 'data' obrigatório" });
    }
    if (req.body.data.length > 20) {
      return res.status(400).json({ error: "Máximo 20 eventos por requisição" });
    }
    const payloadSize = Buffer.byteLength(JSON.stringify(req.body));
    if (payloadSize > 1024 * 1024) {
      return res.status(413).json({ error: "Payload muito grande - máximo 1MB" });
    }

    const enrichedData = req.body.data.map((event: any) => {
      // VALIDAÇÃO EXTRA: Verificar se event_name existe e é válido
      if (!isNonEmptyString(event.event_name)) {
        console.warn("⚠️ event_name ausente ou inválido no evento:", event);
        return null; // Pular este evento
      }

      const sessionId = event.session_id || "";

      // external_id: Prioridade máxima para identificadores persistentes
      let externalId = "";
      let externalIdSource = "";
      
      if (isNonEmptyString(event.user_data?.external_id)) {
        externalId = event.user_data.external_id;
        externalIdSource = "frontend_external_id";
      } else if (isSha256(event.user_data?.em)) {
        externalId = event.user_data.em;
        externalIdSource = "email_hash";
      } else if (isSha256(event.user_data?.ph)) {
        externalId = event.user_data.ph;
        externalIdSource = "phone_hash";
      } else if (sessionId) {
        externalId = crypto.createHash("sha256").update(sessionId).digest("hex");
        externalIdSource = "session_id_fallback";
      }

      // LOG DETALHADO: Log do external_id e sua fonte
      console.log(`🔍 Evento ${event.event_name}:`, {
        event_id: event.event_id || "será_gerado",
        external_id: externalId ? externalId.substring(0, 16) + "..." : "AUSENTE",
        external_id_source: externalIdSource,
        has_email_hash: isSha256(event.user_data?.em),
        has_phone_hash: isSha256(event.user_data?.ph)
      });

      // Remover PII se não estiver em SHA256
      if (event.user_data?.em && !isSha256(event.user_data.em)) {
        console.warn(`⚠️ Email removido do evento ${event.event_name} - não está em SHA256`);
        delete event.user_data.em;
      }
      if (event.user_data?.ph && !isSha256(event.user_data.ph)) {
        console.warn(`⚠️ Telefone removido do evento ${event.event_name} - não está em SHA256`);
        delete event.user_data.ph;
      }

      // fbp/fbc: só incluir se não estiver vazio
      const userData: any = {
        external_id: externalId,
        client_ip_address: ip,
        client_user_agent: userAgent,
      };
      if (isNonEmptyString(event.user_data?.fbp)) userData.fbp = event.user_data.fbp;
      if (isNonEmptyString(event.user_data?.fbc)) userData.fbc = event.user_data.fbc;

      const eventId = event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const eventSourceUrl = event.event_source_url || "https://www.digitalpaisagismo.com.br";
      const eventTime = event.event_time || Math.floor(Date.now() / 1000);
      const actionSource = event.action_source || "website";
      const customData = {
        value: event.custom_data?.value ?? 0,
        currency: event.custom_data?.currency ?? "BRL",
        ...event.custom_data
      };

      return {
        ...event,
        event_id: eventId,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        action_source: actionSource,
        custom_data: customData,
        user_data: userData
      };
    }).filter(Boolean); // Remover eventos nulos (que falharam na validação)

    if (enrichedData.length === 0) {
      return res.status(400).json({ error: "Nenhum evento válido encontrado após validação" });
    }

    const payload = { data: enrichedData };

    console.log("🔄 Enviando eventos para Meta CAPI...", {
      total_events: enrichedData.length,
      events_names: enrichedData.map(e => e.event_name)
    });
    console.log("📦 Payload:", JSON.stringify(payload));
    console.log("📊 Pixel ID:", PIXEL_ID);

    const shouldCompress = Buffer.byteLength(JSON.stringify(payload)) > 2048;
    const body = shouldCompress ? zlib.gzipSync(JSON.stringify(payload)) : JSON.stringify(payload);

    const headers = {
      "Content-Type": "application/json",
      "Connection": "keep-alive",
      "User-Agent": "DigitalPaisagismo-CAPI-Proxy/1.0",
      ...(shouldCompress && { "Content-Encoding": "gzip" })
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${META_URL}?access_token=${ACCESS_TOKEN}`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await response.json();
    const responseTime = Date.now() - startTime;

    console.log("✅ Resposta da Meta:", {
      status: response.status,
      responseTime: `${responseTime}ms`,
      eventsReceived: data.events_received,
      messages: data.messages,
      compression_used: shouldCompress,
      payload_size: Buffer.byteLength(JSON.stringify(payload)),
      events_sent: enrichedData.length
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: "Erro da Meta", 
        details: data,
        processing_time_ms: responseTime
      });
    }
    
    res.status(200).json({
      ...data,
      proxy_metadata: {
        processing_time_ms: responseTime,
        events_processed: enrichedData.length,
        compression_used: shouldCompress,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error("❌ Erro no Proxy CAPI:", error);
    if (error.name === 'AbortError') {
      return res.status(408).json({ 
        error: "Timeout ao enviar evento para a Meta",
        timeout_ms: 8000
      });
    }
    res.status(500).json({ error: "Erro interno no servidor CAPI." });
  }
}
