import type { NextApiRequest, NextApiResponse } from "next"; 
import crypto from "crypto";

// --- CONSTANTES ---
const PIXEL_ID = "1869253103919694";
const ACCESS_TOKEN = "EAAQfmxkTTZCcBPLHsK4PcoJH4wGcjtf8azDR85ESEFdWhTDMulGpC95j0pvL87n2musCk8ooOliRyOQwkkI3PKRpgk7Al6CeQvD3xWDmiJscXmSoO2HnnYUZBZCXK6u4ZBFN7y4muALfM32XWKppfrCMPwFHVuSHqfM7KeYZBlhC7yA9sZAZAq2LAPS3E8ZBaQZDZD";
const META_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

// --- FUNÇÕES AUXILIARES OTIMIZADAS ---
function hashPII(value: string ): string {
  if (!value || typeof value !== 'string') return '';
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function isValidPhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  const clean = phone.replace(/\D/g, '');
  return clean.length >= 10 && clean.length <= 15;
}

// --- HANDLER DA API FINAL E REFINADO ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    if (!req.body?.data || !Array.isArray(req.body.data)) {
      return res.status(400).json({ error: "Payload inválido: o campo 'data' deve ser um array." });
    }

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    const enrichedData = req.body.data.map((event: any) => {
      const userData = event.user_data || {};

      userData.client_ip_address = ip;
      userData.client_user_agent = userAgent;

      if (!userData.external_id) {
        userData.external_id = event.session_id || "";
      }
      
      if (userData.em && isValidEmail(userData.em)) userData.em = hashPII(userData.em);
      if (userData.ph && isValidPhone(userData.ph)) userData.ph = hashPII(userData.ph);
      if (userData.fn && userData.fn.length >= 2) userData.fn = hashPII(userData.fn);
      if (userData.ln && userData.ln.length >= 2) userData.ln = hashPII(userData.ln);
      if (userData.db) userData.db = hashPII(userData.db);
      if (userData.ge) userData.ge = hashPII(userData.ge);
      if (userData.ct) userData.ct = hashPII(userData.ct);
      if (userData.st) userData.st = hashPII(userData.st);
      if (userData.zp) userData.zp = hashPII(userData.zp);
      if (userData.country) userData.country = hashPII(userData.country);

      if (userData.fbc && typeof userData.fbc !== 'string') delete userData.fbc;
      if (userData.fbp && typeof userData.fbp !== 'string') delete userData.fbp;

      const eventId = event.event_id || `evt_combr_fallback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const eventSourceUrl = event.event_source_url || "https://www.digitalpaisagismo.com.br";
      const actionSource = event.action_source || "website";

      const customData = { ...event.custom_data };
      if (!customData.currency ) customData.currency = "BRL";
      if (customData.value) {
        const parsedValue = Number(customData.value);
        customData.value = isNaN(parsedValue) ? 0 : parsedValue;
      }

      return {
        ...event,
        event_id: eventId,
        event_time: event.event_time || Math.floor(Date.now() / 1000),
        event_source_url: eventSourceUrl,
        action_source: actionSource,
        user_data: userData,
        custom_data: customData,
      };
    });

    const response = await fetch(`${META_URL}?access_token=${ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: enrichedData }),
    });

    const result = await response.json();
    res.status(response.status).json(result);

  } catch (err: any) {
    console.error("Erro interno no servidor CAPI (.com.br):", err);
    res.status(500).json({ error: "Erro interno no servidor CAPI.", details: err.message });
  }
}
