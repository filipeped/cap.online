import type { NextApiRequest, NextApiResponse } from "next";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const RATE_LIMIT = 30;
const rateLimitMap = new Map();

// ✅ OTIMIZADO: Domínios permitidos
const ALLOWED_ORIGINS = [
  "https://www.digitalpaisagismo.com.br",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083"
];

// ✅ OTIMIZADO: Validação completa para TODOS os eventos
const EVENT_VALIDATION = {
  Lead: {
    required: ["external_id"],
    forbidden: []
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
  Scroll75: {
    required: [],
    forbidden: ["external_id"]
  },
  Scroll50: {
    required: [],
    forbidden: ["external_id"]
  },
  ButtonClickAutomaticallyDetected: {
    required: [],
    forbidden: ["external_id"]
  },
  VideoPlay: {
    required: [],
    forbidden: ["external_id"]
  },
  SectionView: {
    required: [],
    forbidden: ["external_id"]
  },
  ClickOnFAQ: {
    required: [],
    forbidden: ["external_id"]
  },
  VideoElementClick: {
    required: [],
    forbidden: ["external_id"]
  },
  SubscribedButtonClick: {
    required: [],
    forbidden: ["external_id"]
  },
  ScrollTracking: {
    required: [],
    forbidden: ["external_id"]
  },
  SectionViewTracking: {
    required: [],
    forbidden: ["external_id"]
  },
  VideoPlayTracking: {
    required: [],
    forbidden: ["external_id"]
  }
};

// ✅ OTIMIZADO: Enriquecimento completo para TODOS os eventos
const EVENT_ENRICHMENT = {
  Lead: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  LeadFromWhatsApp: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  PageView: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: false,
    add_session_data: true
  },
  ViewContent: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  Scroll75: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  Scroll50: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  ButtonClickAutomaticallyDetected: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  VideoPlay: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  SectionView: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  ClickOnFAQ: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  VideoElementClick: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  SubscribedButtonClick: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  ScrollTracking: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  SectionViewTracking: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  },
  VideoPlayTracking: {
    add_fbc: true,
    add_context: true,
    add_quality_flags: true,
    add_session_data: true
  }
};

// ✅ OTIMIZADO: Rate limiting com cache otimizado
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const timestamps = rateLimitMap.get(ip)!.filter((t: number) => now - t < windowMs);
  
  if (timestamps.length >= RATE_LIMIT) {
    return false;
  }
  
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  
  // ✅ OTIMIZADO: Limpeza automática do cache
  if (rateLimitMap.size > 1000) {
    const oldestKey = rateLimitMap.keys().next().value;
    rateLimitMap.delete(oldestKey);
  }
  
  return true;
}

// ✅ OTIMIZADO: Logs estruturados com performance
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

// ✅ OTIMIZADO: Limpeza de objetos com performance
function cleanObject(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => 
      Array.isArray(v) ? v.filter(Boolean).length > 0 : v !== undefined && v !== null && v !== ""
    )
  );
}

// ✅ OTIMIZADO: Geração de session ID
function generateSessionId(ip: string, userAgent: string): string {
  const hash = crypto.createHash("sha256").update(`${ip}-${userAgent}-${Date.now()}`).digest("hex");
  return `sess_${Date.now()}_${hash.substring(0, 12)}`;
}

// ✅ OTIMIZADO: Extração de cookies
function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`));
  return match ? match[2] : undefined;
}

// ✅ OTIMIZADO: Função de enriquecimento automático completa
function enrichEvent(event: any, enrichment: any, fbcHeader: string | undefined, sessionId: string, userAgent: string) {
  if (!event.custom_data) event.custom_data = {};
  
  // ✅ OTIMIZADO: Adicionar fbc quando necessário
  if (enrichment.add_fbc && fbcHeader && !event.user_data.fbc) {
    event.user_data.fbc = fbcHeader;
  }
  
  // ✅ OTIMIZADO: Adicionar contexto rico
  if (enrichment.add_context) {
    event.custom_data = {
      ...event.custom_data,
      enhanced_tracking: true,
      proxy_optimized: true,
      data_quality: "enterprise_grade",
      tracking_version: "v2.0_optimized",
      session_persistent: true,
      deduplication_active: true
    };
  }
  
  // ✅ OTIMIZADO: Adicionar flags de qualidade
  if (enrichment.add_quality_flags) {
    event.custom_data = {
      ...event.custom_data,
      anti_duplication_active: true,
      unified_tracking: true,
      quality_optimized: true,
      matching_enhanced: true,
      data_integrity: "verified"
    };
  }
  
  // ✅ OTIMIZADO: Adicionar dados de sessão
  if (enrichment.add_session_data) {
    event.custom_data = {
      ...event.custom_data,
      session_id: sessionId,
      session_timestamp: new Date().toISOString(),
      user_agent_hash: crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 8)
    };
  }
  
  // ✅ OTIMIZADO: Contexto específico por tipo de evento (COMPLETO)
  switch (event.event_name) {
    case "PageView":
      event.custom_data = {
        ...event.custom_data,
        page_type: "landing_page",
        page_section: "home",
        page_category: "conversion_optimized",
        viewport_optimized: true
      };
      break;
      
    case "LeadFromWhatsApp":
      event.custom_data = {
        ...event.custom_data,
        lead_source: "whatsapp_direct",
        conversion_intent: "high",
        contact_method: "whatsapp",
        response_time_optimized: true
      };
      break;
      
    case "Scroll75":
    case "Scroll50":
      event.custom_data = {
        ...event.custom_data,
        scroll_optimized: true,
        engagement_tracked: true,
        behavior_analyzed: true
      };
      break;
      
    case "ButtonClickAutomaticallyDetected":
      event.custom_data = {
        ...event.custom_data,
        click_optimized: true,
        interaction_tracked: true,
        cta_analyzed: true
      };
      break;
      
    case "VideoPlay":
      event.custom_data = {
        ...event.custom_data,
        video_optimized: true,
        media_engagement: true,
        content_consumption: true
      };
      break;
      
    case "SectionView":
      event.custom_data = {
        ...event.custom_data,
        section_optimized: true,
        content_engagement: true,
        layout_analyzed: true
      };
      break;
      
    case "VideoElementClick":
      event.custom_data = {
        ...event.custom_data,
        video_interaction: true,
        click_tracked: true,
        media_engagement: true
      };
      break;
      
    case "SubscribedButtonClick":
      event.custom_data = {
        ...event.custom_data,
        subscription_tracked: true,
        button_optimized: true,
        conversion_tracked: true
      };
      break;
      
    case "ScrollTracking":
      event.custom_data = {
        ...event.custom_data,
        scroll_tracking: true,
        behavior_monitored: true,
        engagement_measured: true
      };
      break;
      
    case "SectionViewTracking":
      event.custom_data = {
        ...event.custom_data,
        section_tracking: true,
        content_monitored: true,
        layout_analyzed: true
      };
      break;
      
    case "VideoPlayTracking":
      event.custom_data = {
        ...event.custom_data,
        video_tracking: true,
        media_monitored: true,
        content_consumption: true
      };
      break;
  }
}

// ✅ OTIMIZADO: Validação robusta de eventos
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
  
  // ✅ OTIMIZADO: Validação de campos obrigatórios
  validation.required.forEach(field => {
    if (!event.user_data?.[field] && !event[field]) {
      errors.push(`Campo obrigatório '${field}' não encontrado para evento ${event.event_name}`);
    }
  });
  
  // ✅ OTIMIZADO: Validação de campos proibidos
  validation.forbidden.forEach(field => {
    if (event.user_data?.[field] || event[field]) {
      errors.push(`Campo '${field}' não deve ser enviado para evento ${event.event_name}`);
    }
  });
  
  return { isValid: errors.length === 0, errors };
}

// ✅ OTIMIZADO: Persistência de eventos falhados com rotação
function persistFailedEvent(event: any, error: any) {
  try {
    const failedEvent = {
      timestamp: new Date().toISOString(),
      event,
      error: error.message || error,
      retry_count: 0
    };
    
    const logPath = path.join(process.cwd(), "failed-events.log");
    
    // ✅ OTIMIZADO: Rotação automática de logs
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) {
      fs.truncateSync(logPath, 0);
    }
    
    fs.appendFileSync(logPath, JSON.stringify(failedEvent) + "\n");
    log("warn", "Evento falhou e foi persistido para reprocessamento", { 
      event_name: event.event_name, 
      error: error.message 
    });
  } catch (persistError) {
    log("error", "Erro ao persistir evento falhado", persistError);
  }
}

// ✅ OTIMIZADO: Handler principal com performance máxima
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-ID");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ 
    error: "Método não permitido", 
    allowed_methods: ["POST", "OPTIONS"] 
  });

  const startTime = Date.now();
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "";

  log("info", "Requisição recebida", { 
    ip, 
    userAgent, 
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
    
    const payloadSize = Buffer.byteLength(JSON.stringify(req.body));
    if (payloadSize > 1024 * 1024) {
      return res.status(413).json({ 
        error: "Payload muito grande", 
        details: "Máximo 1MB por requisição" 
      });
    }

    // ✅ ATUALIZADO: Novo Pixel ID e Token
    const pixelId = pixel_id || "1142320931265624";
    const accessToken = process.env.META_ACCESS_TOKEN || "EAAQfmxkTTZCcBPO6rRZC3CCdEXUAvAEfteO3nZCP6AZCiIPv0Pmz8KGLXXdwVitIZBmzEo2MabsscCZAgjtcUcDbtyAcOAANOqZCSwabcgYevluCcQnKkFjOchJjwOwEZClZBt7Oi4kQhPPQZB75kLvZCScyNjkhibY1aYWQ7Linj0W8ERDtYPSsXXG7UGcmjhslOTsQwZDZD";

    const seenEventIds = new Set();
    const validatedEvents: any[] = [];
    const fbpHeader = getCookie(req.headers.cookie, "_fbp");
    const fbcHeader = getCookie(req.headers.cookie, "_fbc");
    const sessionId = req.headers["x-session-id"] || generateSessionId(ip, userAgent);

    for (const event of data) {
      if (!event.event_id) {
        event.event_id = "evt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
      }
      
      if (seenEventIds.has(event.event_id)) {
        log("warn", "Evento duplicado ignorado", { event_id: event.event_id });
        continue;
      }
      seenEventIds.add(event.event_id);

      const validation = validateEvent(event);
      if (!validation.isValid) {
        log("error", "Evento inválido", { 
          event_name: event.event_name, 
          errors: validation.errors 
        });
        continue;
      }

      if (!event.user_data) event.user_data = {};
      event.user_data.client_ip_address = ip;
      event.user_data.client_user_agent = userAgent;
      
      if (!event.user_data.fbp) event.user_data.fbp = fbpHeader || req.cookies?._fbp;
      if (!event.user_data.fbc) event.user_data.fbc = fbcHeader || req.cookies?._fbc;

      // ✅ OTIMIZADO: External ID apenas para Lead
      if (event.event_name === "Lead") {
        const externalIds: string[] = [];
        if (event.user_data.external_id) {
          if (Array.isArray(event.user_data.external_id)) {
            externalIds.push(...event.user_data.external_id);
          } else {
            externalIds.push(event.user_data.external_id);
          }
        }
        if (sessionId) externalIds.push(sessionId);
        const uniqueIds = [...new Set(externalIds.filter(id => id && id.length > 0))];
        if (uniqueIds.length > 0) {
          event.user_data.external_id = uniqueIds.length === 1 ? uniqueIds[0] : uniqueIds;
        }
      }

      if (!event.event_source_url) {
        event.event_source_url = req.headers.referer || req.headers["x-page-url"] || "https://www.digitalpaisagismo.com.br";
      }

      // ✅ OTIMIZADO: Aplicar enriquecimento automático (COMPLETO)
      const enrichment = EVENT_ENRICHMENT[event.event_name as keyof typeof EVENT_ENRICHMENT];
      if (enrichment) {
        enrichEvent(event, enrichment, fbcHeader, sessionId, userAgent);
      }

      event.action_source = "website";
      event.user_data = cleanObject(event.user_data);
      event.custom_data = cleanObject(event.custom_data || {});

      validatedEvents.push(event);
    }

    if (validatedEvents.length === 0) {
      return res.status(400).json({ error: "Nenhum evento válido encontrado" });
    }

    log("info", "Eventos processados", {
      total: data.length,
      valid: validatedEvents.length,
      invalid: data.length - validatedEvents.length,
      sessionId,
      fbpSent: validatedEvents[0]?.user_data?.fbp,
      fbcSent: validatedEvents[0]?.user_data?.fbc,
      enrichmentApplied: validatedEvents.map(e => e.event_name)
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
      ...(shouldCompress && { "Content-Encoding": "gzip" })
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
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      const json = await response.json();
      const responseTime = Date.now() - startTime;

      log("info", "Resposta da Meta", {
        status: response.status,
        responseTime,
        eventsReceived: json.events_received,
        messages: json.messages,
        sessionId,
        enrichmentApplied: validatedEvents.length
      });

      if (!response.ok) {
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
          session_id: sessionId,
          enrichment_applied: validatedEvents.map(e => e.event_name),
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      clearTimeout(timeout);
      
      // ✅ OTIMIZADO: Tratamento específico de timeout
      if (error.name === 'AbortError') {
        log("error", "Timeout ao enviar para Meta", { timeoutMs });
        validatedEvents.forEach(event => persistFailedEvent(event, { message: "Timeout", timeoutMs }));
        return res.status(408).json({ 
          error: "Timeout ao enviar evento para a Meta",
          timeout_ms: timeoutMs,
          events_processed: validatedEvents.length
        });
      }
      
      validatedEvents.forEach(event => persistFailedEvent(event, error));
      return res.status(500).json({ 
        error: "Erro ao enviar evento para a Meta", 
        details: error.message 
      });
    }
  } catch (error: any) {
    log("error", "Erro inesperado", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: "Erro inesperado ao processar evento", 
      details: process.env.NODE_ENV === "development" ? error.message : "Erro interno" 
    });
  }
}
