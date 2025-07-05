import type { NextApiRequest, NextApiResponse } from "next";
import zlib from "zlib";
import fs from "fs";
import path from "path";

const RATE_LIMIT = 30;
const rateLimitMap = new Map();

// Domínios permitidos para CORS
const ALLOWED_ORIGINS = [
  "https://www.digitalpaisagismo.com.br",
  "http://localhost:3000" // Para desenvolvimento
];

// Validação de campos obrigatórios por tipo de evento
const EVENT_VALIDATION = {
  Lead: {
    required: ["external_id"],
    forbidden: [] // external_id é obrigatório apenas para Lead
  },
  PageView: {
    required: [],
    forbidden: ["external_id"]
  },
  ViewContent: {
    required: [],
    forbidden: ["external_id"]
  },
  LeadFromWhatsApp: {
    required: [],
    forbidden: ["external_id"]
  },
  ScrollTracking: {
    required: [],
    forbidden: ["external_id"]
  },
  TimeOnPageTracking: {
    required: [],
    forbidden: ["external_id"]
  },
  SectionViewTracking: {
    required: [],
    forbidden: ["external_id"]
  },
  ClickOnFAQ: {
    required: [],
    forbidden: ["external_id"]
  },
  ButtonClickAutomaticallyDetected: {
    required: [],
    forbidden: ["external_id"]
  },
  VideoPlayTracking: {
    required: [],
    forbidden: ["external_id"]
  }
};

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip)!.filter((t: number) => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function log(level: string, message: any, meta?: any) {
  if (process.env.NODE_ENV !== "production") {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta && { meta })
    };
    console.log(`[${logEntry.timestamp}] [${level.toUpperCase()}]`, logEntry.message, meta ? logEntry.meta : "");
  }
}

function cleanObject(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) =>
      Array.isArray(v) ? v.filter(Boolean).length > 0 : v !== undefined && v !== null && v !== ""
    )
  );
}

function validateEvent(event: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!event.event_name) {
    errors.push("event_name é obrigatório");
    return { isValid: false, errors };
  }

  const validation = EVENT_VALIDATION[event.event_name as keyof typeof EVENT_VALIDATION];
  if (!validation) {
    errors.push(`Tipo de evento '${event.event_name}' não é suportado`);
    return { isValid: false, errors };
  }

  // Verificar campos obrigatórios
  validation.required.forEach(field => {
    if (!event.user_data?.[field] && !event[field]) {
      errors.push(`Campo obrigatório '${field}' não encontrado para evento ${event.event_name}`);
    }
  });

  // Verificar campos proibidos
  validation.forbidden.forEach(field => {
    if (event.user_data?.[field] || event[field]) {
      errors.push(`Campo '${field}' não deve ser enviado para evento ${event.event_name}`);
    }
  });

  return { isValid: errors.length === 0, errors };
}

function persistFailedEvent(event: any, error: any) {
  try {
    const failedEvent = {
      timestamp: new Date().toISOString(),
      event,
      error: error.message || error,
      retry_count: 0
    };

    const logPath = path.join(process.cwd(), "failed-events.log");
    fs.appendFileSync(logPath, JSON.stringify(failedEvent) + "\n");
    
    log("warn", "Evento falhou e foi persistido para reprocessamento", { 
      event_name: event.event_name, 
      error: error.message 
    });
  } catch (persistError) {
    log("error", "Erro ao persistir evento falhado", persistError);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS dinâmico
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ 
      error: "Método não permitido", 
      allowed_methods: ["POST", "OPTIONS"] 
    });
  }

  const startTime = Date.now();
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
  
  log("info", "Requisição recebida", { 
    ip, 
    userAgent: req.headers["user-agent"],
    contentLength: req.headers["content-length"]
  });

  if (!rateLimit(ip)) {
    log("warn", "Rate limit excedido", { ip });
    return res.status(429).json({ 
      error: "Limite de requisições excedido", 
      retry_after: 60 
    });
  }

  try {
    const { data, pixel_id, test_event_code } = req.body;
    
    // Validação do payload
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ 
        error: "Payload inválido", 
        details: "data deve ser um array não vazio" 
      });
    }
    
    if (data.length > 20) {
      return res.status(400).json({ 
        error: "Payload muito grande", 
        details: "Máximo 20 eventos por requisição" 
      });
    }

    // Validação de tamanho do payload
    const payloadSize = Buffer.byteLength(JSON.stringify(req.body));
    if (payloadSize > 1024 * 1024) { // 1MB
      return res.status(413).json({ 
        error: "Payload muito grande", 
        details: "Máximo 1MB por requisição" 
      });
    }

    const pixelId = pixel_id || "2528271940857156";
    const accessToken = process.env.META_ACCESS_TOKEN || "EAAQfmxkTTZCcBPNmwPw6SyHeo5Gt7YzTf5OQGgxAqiZBQRgQoIL1aWAVcynfSxaB7Pvpl7JZBH8kvqSTU2cMolfBLVP9LWbZCI7cdgwpcjSlf40lLndmyJMfiDNEFcMaRURGBXvUE5Fw0hf0j1w5kMprPz13IdRZBWBppfdWnLydkRicmm3BUejkHoUEwWAZDZD";
    const seenEventIds = new Set();
    const validatedEvents: any[] = [];

    // Processar e validar cada evento
    for (const event of data) {
      // Gerar event_id se não existir
      if (!event.event_id) {
        event.event_id = "evt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
      }
      
      // Deduplicação
      if (seenEventIds.has(event.event_id)) {
        log("warn", "Evento duplicado ignorado", { event_id: event.event_id });
        continue;
      }
      seenEventIds.add(event.event_id);

      // Validação específica do evento
      const validation = validateEvent(event);
      if (!validation.isValid) {
        log("error", "Evento inválido", { 
          event_name: event.event_name, 
          errors: validation.errors 
        });
        continue;
      }

      // Preencher campos técnicos
      if (!event.user_data) event.user_data = {};
      if (!event.user_data.client_ip_address) event.user_data.client_ip_address = ip;
      if (!event.user_data.client_user_agent) event.user_data.client_user_agent = req.headers["user-agent"] || "";
      if (!event.user_data.fbp && req.cookies?._fbp) event.user_data.fbp = req.cookies._fbp;
      if (!event.user_data.fbc && req.cookies?._fbc) event.user_data.fbc = req.cookies._fbc;
      if (!event.event_source_url && req.headers.referer) event.event_source_url = req.headers.referer;

      event.action_source = "website";
      event.user_data = cleanObject(event.user_data);
      event.custom_data = cleanObject(event.custom_data || {});

      validatedEvents.push(event);
    }

    if (validatedEvents.length === 0) {
      return res.status(400).json({ 
        error: "Nenhum evento válido encontrado" 
      });
    }

    log("info", "Eventos processados", { 
      total: data.length, 
      valid: validatedEvents.length,
      invalid: data.length - validatedEvents.length
    });

    const controller = new AbortController();
    const timeoutMs = parseInt(process.env.CAPI_TIMEOUT_MS || "8000", 10);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const payload = JSON.stringify({ 
      data: validatedEvents, 
      ...(test_event_code && { test_event_code }) 
    });
    
    const shouldCompress = Buffer.byteLength(payload) > 2048;
    const body: Buffer | string = shouldCompress ? zlib.gzipSync(payload) : payload;

    const headers: any = {
      "Content-Type": "application/json",
      "Connection": "keep-alive",
      "User-Agent": "DigitalPaisagismo-CAPI-Proxy/1.0",
      ...(shouldCompress && { "Content-Encoding": "gzip" }),
    };

    try {
      log("info", "Enviando para Meta", { 
        pixelId, 
        eventCount: validatedEvents.length,
        compressed: shouldCompress,
        payloadSize: Buffer.byteLength(payload)
      });

      const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const json = await response.json();
      const responseTime = Date.now() - startTime;

      log("info", "Resposta da Meta", { 
        status: response.status,
        responseTime,
        eventsReceived: json.events_received,
        messages: json.messages
      });

      if (!response.ok) {
        log("error", "Erro da Meta", { 
          status: response.status, 
          response: json,
          events: validatedEvents.map(e => ({ name: e.event_name, id: e.event_id }))
        });
        
        // Persistir eventos falhados
        validatedEvents.forEach(event => persistFailedEvent(event, json));
        
        return res.status(response.status).json({ 
          error: "Erro da Meta", 
          details: json,
          events_processed: validatedEvents.length
        });
      }

      res.status(200).json({
        ...json,
        proxy_metadata: {
          processing_time_ms: responseTime,
          events_processed: validatedEvents.length,
          compression_used: shouldCompress,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error: any) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        log("error", "Timeout ao enviar para Meta", { timeoutMs });
        return res.status(408).json({ 
          error: "Timeout ao enviar evento para a Meta",
          timeout_ms: timeoutMs
        });
      }
      
      log("error", "Erro ao enviar para Meta", { 
        error: error.message,
        events: validatedEvents.map(e => ({ name: e.event_name, id: e.event_id }))
      });
      
      // Persistir eventos falhados
      validatedEvents.forEach(event => persistFailedEvent(event, error));
      
      return res.status(500).json({ 
        error: "Erro ao enviar evento para a Meta",
        details: error.message
      });
    }
    
  } catch (error: any) {
    log("error", "Erro inesperado", { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: "Erro inesperado ao processar evento",
      details: process.env.NODE_ENV === "development" ? error.message : "Erro interno"
    });
  }
}
