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
    const payload = {
      ...req.body,
      client_ip_address: req.headers["x-forwarded-for"] || undefined
    };

    const response = await fetch(
      "https://graph.facebook.com/v19.0/1771053817142417/events?access_token=EAAQfmxkTTZCcBO7Eg32S6CRuZCKinkgADP8Emq7xH6QebxYmmiaV5ZCC321ETNKrquoWGIz5VF0ZBpVeU2cl7clMf9r1ZCJphdHEycTnnMeFUuZC7rdLhOZA3SobgiCO2gFN27JqIAaYqRuLFLxoq24xZCaEGmEx0FSReKeUaNNLycsDx1cfwizggJZB5kkNINwZDZD",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Erro no Proxy CAPI:", err);
    res.status(500).json({ error: "Erro interno no servidor CAPI." });
  }
}
