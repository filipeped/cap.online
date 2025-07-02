import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // ✅ VALIDAR PAYLOAD
    if (!req.body || !req.body.data) {
      console.log("❌ Proxy CAPI: Payload inválido recebido:", req.body);
      return res.status(400).json({ error: "Payload inválido - campo 'data' obrigatório" });
    }

    const payload = {
      ...req.body,
      client_ip_address: req.headers["x-forwarded-for"] || undefined
    };

    // ✅ LOGS DE DEBUG
    console.log("🔄 Proxy CAPI: Enviando para Meta...");
    console.log("📊 Proxy CAPI: Pixel ID:", "735685568823270");
    console.log("📊 Proxy CAPI: Payload size:", JSON.stringify(payload).length, "bytes");

    const response = await fetch(
      "https://graph.facebook.com/v19.0/735685568823270/events?access_token=EAAQfmxkTTZCcBOx7Rlh6wgZAQYHETf45wf5jknPwae98s3JgV6qZA4YAujlvMnFQE29MY0DWX3pJGeQx04XT0zDuuU7SegnCsCN0lK6LVil4yaelgI7CBPwVVFu4N8Gjl2vsUcvBAgtkPX3dlXtk4wlIeDm6C4XMvGeZBMjRPEZAd6Mpyiz5r2nuu8rcGHAZDZD",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    
    // ✅ LOGS DE RESPOSTA
    console.log("✅ Proxy CAPI: Resposta da Meta - Status:", response.status);
    console.log("✅ Proxy CAPI: Resposta da Meta - Data:", data);
    
    if (response.ok) {
      console.log("�� Proxy CAPI: Evento enviado com SUCESSO!");
    } else {
      console.log("❌ Proxy CAPI: Erro na resposta da Meta:", response.status, data);
    }

    res.status(response.status).json(data);
  } catch (err) {
    console.error("❌ Erro no Proxy CAPI:", err);
    res.status(500).json({ error: "Erro interno no servidor CAPI." });
  }
}
