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
    if (!req.body || !req.body.data) {
      console.log("❌ Payload inválido:", req.body);
      return res.status(400).json({ error: "Payload inválido - campo 'data' obrigatório" });
    }

    const payload = {
      ...req.body,
      client_ip_address: req.headers["x-forwarded-for"] || undefined
    };

    console.log("📤 Enviando evento para Meta...");
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(
      "https://graph.facebook.com/v19.0/1142320931265624/events?access_token=EAAQfmxkTTZCcBPE6z5Mgf1ZCfkKUhNFD5LU2AuEmyLtuV1UVSwjANzv83DstSvctfcO3iZCHW1xwWky9a4qYg8RCy2N4SKZAZCTvwWjRbks1ZAjqKjlDjsxreDH65yvvb7ZAr51xrm5N83PwwzKuTxr1fFvaMsqEmkfp5Y6wVmOMijWjRdKv0dUfnNZBb1ZBKFAZDZD",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    console.log("✅ Resposta da Meta:", data);
    res.status(response.status).json(data);
  } catch (err) {
    console.error("❌ Erro no Proxy CAPI:", err);
    res.status(500).json({ error: "Erro interno no servidor CAPI." });
  }
}
