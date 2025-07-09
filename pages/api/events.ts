// ✅ Proxy Meta CAPI com deduplicação real e user_data enriquecido
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const PIXEL_ID = "1142320931265624";
const ACCESS_TOKEN = "EAAQfmxkTTZCcBPIMWwATuCACQWiLQ7u1qwP1ZBA46VbAu0BoBLmmSwWjEw5oRSyJRaGNQnLK7b6ttEF3OCNq2u3eZBCZBZBfPUJj2pdBz4bSxyx4ENCuxIA4yVnkNGF8mB2O5A0uVMg1940Geu6kGR6mu6swQGxx2tWaa3RouTuCXBngVwpQeH18kuq3EZBAZDZD";
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

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    const enrichedData = req.body.data.map((event: any) => {
      // Garantir session_id para external_id
      let sessionId = event.session_id;
      if (!sessionId) {
        sessionId = `${ip}_${userAgent}_${Date.now()}`;
        console.warn("⚠️ session_id não enviado! Gerando fallback para external_id.");
      }
      const externalId = crypto.createHash("sha256").update(sessionId).digest("hex");

      // Garantir event_id único e logar se não vier do frontend
      const eventId = event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      if (!event.event_id) {
        console.warn("⚠️ event_id não enviado pelo frontend! Gerando novo no backend:", eventId);
      }

      const eventTime = event.event_time || Math.floor(Date.now() / 1000);
      const actionSource = event.action_source || "website";
      const eventSourceUrl = event.event_source_url || "https://www.digitalpaisagismo.pro";

      // Ajuste: só envia value se for número > 0
      const customData = {
        ...event.custom_data,
        value: typeof event.custom_data?.value === "number" && event.custom_data.value > 0
          ? event.custom_data.value
          : undefined,
        currency: event.custom_data?.currency ?? "BRL"
      };

      // Logs de auditoria para campos críticos
      if (!event.user_data?.fbp) console.warn("⚠️ fbp ausente no evento!");
      if (!event.user_data?.fbc) console.warn("⚠️ fbc ausente no evento!");

      return {
        event_name: event.event_name,
        event_id: eventId,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        action_source: actionSource,
        custom_data: customData,
        user_data: {
          external_id: externalId,
          client_ip_address: ip,
          client_user_agent: userAgent,
          fbp: event.user_data?.fbp || "",
          fbc: event.user_data?.fbc || ""
        }
      };
    });

    const payload = { data: enrichedData };

    console.log("📤 Enviando evento para Meta...");
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

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
