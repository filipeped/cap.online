// ✅ digitalpaisagismo.com.br-capi-v6-otimizado
// Proxy Meta CAPI com IPv6, deduplicação forte, user_data validado e event_name garantido

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const PIXEL_ID = "1142320931265624";
const ACCESS_TOKEN = "EAAQfmxkTTZCcBPMtbiRdOTtGC1LycYJsKXnFZCs3N04MsoBjbx5WdvaPhObbtmKg3iDZBJZAjAlpzqWAr80uEUsUSm95bVCODpzJSsC3X6gA9u6yPC3oDko8gUIMW2SA5C7MOsZBvmyVN72N38UcMKp8uGbQaPxe9r5r66H6PAXuZCieIl6gPIFU5c2ympRwZDZD";
const META_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    if (!req.body?.data || !Array.isArray(req.body.data)) {
      console.log("❌ Payload inválido:", req.body);
      return res.status(400).json({ error: "Payload inválido - campo 'data' obrigatório" });
    }

    const ipHeader = req.headers["x-forwarded-for"] as string;
    const rawIp = ipHeader?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const clientIp = rawIp.includes(":") ? rawIp : `::ffff:${rawIp}`;
    const userAgent = req.headers["user-agent"] || "";

    const enrichedData = req.body.data.map((event: any) => {
      const rawSessionId = event.session_id || "";
      const namespacedId = `com.br::${rawSessionId}`;
      const externalId = namespacedId ? crypto.createHash("sha256").update(namespacedId).digest("hex") : "";
      const eventId = event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const eventName = event.event_name || "PageView";
      const eventSourceUrl = event.event_source_url || "https://www.digitalpaisagismo.com.br";
      const eventTime = event.event_time || Math.floor(Date.now() / 1000);
      const actionSource = event.action_source || "website";

      const rawValue = event.custom_data?.value;
      const parsedValue = typeof rawValue === "string" ? Number(rawValue) : rawValue;

      const customData = {
        ...event.custom_data,
        currency: event.custom_data?.currency ?? "BRL",
      };
      if (!isNaN(parsedValue) && parsedValue > 0) {
        customData.value = parsedValue;
      } else {
        delete customData.value;
      }

      const fbcValue = event.user_data?.fbc;
      const isFbcValid = typeof fbcValue === "string" && fbcValue.includes("fb.");

      const userData: Record<string, string> = {
        external_id: externalId,
        client_ip_address: clientIp,
        client_user_agent: userAgent,
      };

      ["fbp", "fbc", "em", "ph", "fn", "ln"].forEach((key) => {
        const value = event.user_data?.[key];
        if (typeof value === "string" && value.trim() !== "") {
          if (key === "fbc" && !isFbcValid) return;
          userData[key] = value;
        }
      });

      return {
        ...event,
        event_name: eventName,
        event_id: eventId,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        action_source: actionSource,
        custom_data: customData,
        user_data: userData
      };
    });

    const payload = { data: enrichedData };

    console.log("🔄 Enviando evento para Meta CAPI...");
    console.log("📦 Payload:", JSON.stringify(payload));
    console.log("📊 Pixel ID:", PIXEL_ID);

    const response = await fetch(`${META_URL}?access_token=${ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("✅ Resposta da Meta:", data);
    res.status(response.status).json(data);
  } catch (err) {
    console.error("❌ Erro no Proxy CAPI:", err);
    res.status(500).json({ error: "Erro interno no servidor CAPI." });
  }
}
