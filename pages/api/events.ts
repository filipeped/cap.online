import type { NextApiRequest, NextApiResponse } from "next";
import zlib from "zlib";

const RATE_LIMIT = 30;
const rateLimitMap = new Map();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter((t: number) => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function log(level: string, message: any) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[${new Date().toISOString()}] [${level}]`, message);
  }
}

function cleanObject(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) =>
      Array.isArray(v) ? v.filter(Boolean).length > 0 : v !== undefined && v !== null && v !== ""
    )
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.digitalpaisagismo.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
  if (!rateLimit(ip)) return res.status(429).json({ error: "Limite de requisições excedido. Tente novamente em instantes." });

  try {
    const { data, pixel_id, test_event_code } = req.body;
    if (!Array.isArray(data) || data.length === 0 || data.length > 20) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const pixelId = pixel_id || "2528271940857156";
    const accessToken = "EAAQfmxkTTZCcBPNmwPw6SyHeo5Gt7YzTf5OQGgxAqiZBQRgQoIL1aWAVcynfSxaB7Pvpl7JZBH8kvqSTU2cMolfBLVP9LWbZCI7cdgwpcjSlf40lLndmyJMfiDNEFcMaRURGBXvUE5Fw0hf0j1w5kMprPz13IdRZBWBppfdWnLydkRicmm3BUejkHoUEwWAZDZD";
    const seenEventIds = new Set();

    data.forEach((event: any) => {
      if (!event.event_id) event.event_id = "evt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
      if (seenEventIds.has(event.event_id)) return;
      seenEventIds.add(event.event_id);

      if (!event.user_data) event.user_data = {};
      if (!event.user_data.client_ip_address) event.user_data.client_ip_address = ip;
      if (!event.user_data.client_user_agent) event.user_data.client_user_agent = req.headers["user-agent"] || "";
      if (!event.user_data.fbp && req.cookies?._fbp) event.user_data.fbp = req.cookies._fbp;
      if (!event.user_data.fbc && req.cookies?._fbc) event.user_data.fbc = req.cookies._fbc;
      if (!event.event_source_url && req.headers.referer) event.event_source_url = req.headers.referer;
      event.action_source = "website";

      event.user_data = cleanObject(event.user_data);
      event.custom_data = cleanObject(event.custom_data || {});
    });

    const controller = new AbortController();
    const timeoutMs = 8000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const payload = JSON.stringify({ data, ...(test_event_code && { test_event_code }) });
    const shouldCompress = Buffer.byteLength(payload) > 2048;
    const body: Buffer | string = shouldCompress ? zlib.gzipSync(payload) : payload;

    const headers: any = {
      "Content-Type": "application/json",
      "Connection": "keep-alive",
      ...(shouldCompress && { "Content-Encoding": "gzip" }),
    };

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const json = await response.json();

      if (!response.ok) {
        log("error", json);
        return res.status(response.status).json({ error: "Erro da Meta", details: json });
      }

      log("info", json);
      res.status(200).json(json);
    } catch (error: any) {
      clearTimeout(timeout);
      log("error", error.message);
      return res.status(500).json({ error: "Erro ao enviar evento para a Meta" });
    }
  } catch (error) {
    log("error", error);
    res.status(500).json({ error: "Erro inesperado ao enviar evento para a Meta" });
  }
}
