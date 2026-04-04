const LIMIT_PER_DAY = 2;
const RATE_TTL_SECONDS = 60 * 60 * 24 * 2;
const OPENAI_URL = "https://api.openai.com/v1/responses";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MANUSCRIPT_MAX_CHARS = 12000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";

    if (url.pathname !== "/v1/novel-feedback") {
      return json(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        404,
        origin,
        allowedOrigin
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowedOrigin),
      });
    }

    if (request.method !== "POST") {
      return json(
        { error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } },
        405,
        origin,
        allowedOrigin
      );
    }

    if (!isOriginAllowed(origin, allowedOrigin)) {
      return json(
        { error: { code: "FORBIDDEN_ORIGIN", message: "Origin not allowed" } },
        403,
        origin,
        allowedOrigin
      );
    }

    if (!isJsonRequest(request)) {
      return json(
        { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" } },
        415,
        origin,
        allowedOrigin
      );
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) {
      return json(
        { error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } },
        400,
        origin,
        allowedOrigin
      );
    }

    const payload = parsed.value;
    const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken.trim() : "";
    if (!turnstileToken) {
      return json(
        { error: { code: "BAD_REQUEST", message: "turnstileToken is required" } },
        400,
        origin,
        allowedOrigin
      );
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      console.error("Missing TURNSTILE_SECRET_KEY secret");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "보안 검증 구성이 잘못되었습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    const clientId = request.headers.get("CF-Connecting-IP") || "unknown";
    const turnstileOk = await verifyTurnstileToken({
      secret: env.TURNSTILE_SECRET_KEY,
      token: turnstileToken,
      remoteIp: clientId,
    });
    if (!turnstileOk) {
      return json(
        { error: { code: "INVALID_CAPTCHA", message: "보안 검증에 실패했습니다." } },
        403,
        origin,
        allowedOrigin
      );
    }

    const manuscript = typeof payload.manuscript === "string" ? payload.manuscript.trim() : "";

    if (!manuscript) {
      return json(
        { error: { code: "BAD_REQUEST", message: "manuscript is required" } },
        400,
        origin,
        allowedOrigin
      );
    }

    if (manuscript.length > MANUSCRIPT_MAX_CHARS) {
      return json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: `manuscript must be <= ${MANUSCRIPT_MAX_CHARS} chars` } },
        413,
        origin,
        allowedOrigin
      );
    }

    const checks = Array.isArray(payload.checks)
      ? payload.checks.filter((item) => typeof item === "string")
      : [];
    const preset = typeof payload.preset === "string" ? payload.preset : "";
    const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};

    const today = new Date().toISOString().slice(0, 10);
    const rateKey = `novel:${today}:${clientId}`;
    const limit = await consumeRateLimit(env, {
      key: rateKey,
      limit: LIMIT_PER_DAY,
      ttlSec: RATE_TTL_SECONDS,
    });
    if (!limit.ok) {
      console.error("Rate limiter error", limit.reason || "unknown");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "요청 제한 처리에 실패했습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }
    if (!limit.allowed) {
      return json(
        {
          error: { code: "RATE_LIMITED", message: "오늘 사용 횟수를 모두 사용했습니다." },
          usage: { remainingToday: 0, limitPerDay: LIMIT_PER_DAY },
        },
        429,
        origin,
        allowedOrigin
      );
    }

    if (!env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY secret");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 요청 구성이 잘못되었습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    const prompt = buildPrompt({ manuscript, preset, checks, meta });

    let openAiResponse;
    try {
      openAiResponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildOpenAiRequest(prompt)),
      });
    } catch (error) {
      console.error("OpenAI request failed", summarizeError(error));
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 서비스 연결에 실패했습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    if (!openAiResponse.ok) {
      console.error("OpenAI upstream status", openAiResponse.status);
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 응답 생성에 실패했습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    let openAiJson;
    try {
      openAiJson = await openAiResponse.json();
    } catch (error) {
      console.error("OpenAI JSON parse failed", summarizeError(error));
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 응답 처리에 실패했습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    const outputText = extractOutputText(openAiJson);
    if (!outputText) {
      console.error("OpenAI output_text missing");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 응답이 비어 있습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    let normalized;
    try {
      normalized = normalizeModelPayload(JSON.parse(outputText));
    } catch (error) {
      console.error("Model output parse/normalize failed", summarizeError(error));
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 응답 포맷이 올바르지 않습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    return json(
      {
        ...normalized,
        usage: {
          remainingToday: Math.max(0, limit.remainingToday),
          limitPerDay: LIMIT_PER_DAY,
        },
      },
      200,
      origin,
      allowedOrigin
    );
  },
};

export class RateLimiterDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, reason: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const key = typeof payload?.key === "string" ? payload.key : "";
    const limit = Number(payload?.limit);
    const ttlSec = Number(payload?.ttlSec);

    if (!key || !Number.isFinite(limit) || !Number.isFinite(ttlSec)) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const storageKey = `rate:${key}`;
    const now = Date.now();
    const ttlMs = Math.max(1, ttlSec) * 1000;
    const current = await this.state.storage.get(storageKey);
    const expired = !current || typeof current.expiresAt !== "number" || current.expiresAt <= now;
    const baseCount = expired ? 0 : Number(current.count || 0);

    if (baseCount >= limit) {
      return new Response(
        JSON.stringify({
          ok: true,
          allowed: false,
          usedCount: baseCount,
          remainingToday: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const nextCount = baseCount + 1;
    await this.state.storage.put(storageKey, {
      count: nextCount,
      expiresAt: now + ttlMs,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        allowed: true,
        usedCount: nextCount,
        remainingToday: Math.max(0, limit - nextCount),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}

function isOriginAllowed(origin, allowedOrigin) {
  return Boolean(origin && allowedOrigin && origin === allowedOrigin);
}

function isJsonRequest(request) {
  const contentType = request.headers.get("Content-Type") || "";
  return contentType.toLowerCase().includes("application/json");
}

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };

  if (isOriginAllowed(origin, allowedOrigin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function json(payload, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, allowedOrigin),
    },
  });
}

async function parseJson(request) {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function buildPrompt({ manuscript, preset, checks, meta }) {
  return [
    "너는 한국어 소설 편집자다.",
    "점검 항목별로 점수(10점), 근거, 수정안을 간결하게 작성한다.",
    "반드시 JSON으로만 응답한다.",
    `checks: ${JSON.stringify(checks)}`,
    `meta: ${JSON.stringify(meta)}`,
    `preset: ${preset}`,
    "",
    "원고:",
    manuscript,
  ].join("\n");
}

function buildOpenAiRequest(prompt) {
  return {
    model: "gpt-4o-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "novel_feedback",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["overallScore", "summary", "items"],
          properties: {
            overallScore: { type: "number" },
            summary: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "label", "score", "evidence", "suggestion"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  score: { type: "number" },
                  evidence: {
                    type: "array",
                    items: { type: "string" },
                  },
                  suggestion: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function extractOutputText(openAiJson) {
  if (typeof openAiJson.output_text === "string" && openAiJson.output_text.trim()) {
    return openAiJson.output_text.trim();
  }

  if (!Array.isArray(openAiJson.output)) {
    return "";
  }

  const texts = [];
  for (const item of openAiJson.output) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function normalizeModelPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is not object");
  }

  const overallScore = Number(payload.overallScore);
  const summary = typeof payload.summary === "string" ? payload.summary : "";
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!Number.isFinite(overallScore) || !summary) {
    throw new Error("missing top-level fields");
  }

  const normalizedItems = items.map((item) => {
    const id = typeof item.id === "string" ? item.id : "item";
    const label = typeof item.label === "string" ? item.label : id;
    const score = Number(item.score);
    const suggestion = typeof item.suggestion === "string" ? item.suggestion : "";
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.filter((line) => typeof line === "string")
      : [];

    if (!Number.isFinite(score)) {
      throw new Error("item score invalid");
    }

    return {
      id,
      label,
      score,
      evidence,
      suggestion,
    };
  });

  return {
    overallScore,
    summary,
    items: normalizedItems,
  };
}

function summarizeError(error) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message;
  return String(error);
}

async function verifyTurnstileToken({ secret, token, remoteIp }) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.success === true;
  } catch (error) {
    console.error("Turnstile verify failed", summarizeError(error));
    return false;
  }
}

async function consumeRateLimit(env, { key, limit, ttlSec }) {
  try {
    const id = env.RATE_LIMITER.idFromName(key);
    const stub = env.RATE_LIMITER.get(id);
    const response = await stub.fetch("https://rate-limiter.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, limit, ttlSec }),
    });
    if (!response.ok) {
      return { ok: false, reason: `status_${response.status}` };
    }

    const data = await response.json();
    if (!data?.ok) {
      return { ok: false, reason: data?.reason || "invalid_response" };
    }

    return {
      ok: true,
      allowed: data.allowed === true,
      remainingToday: Number.isFinite(Number(data.remainingToday)) ? Number(data.remainingToday) : 0,
    };
  } catch (error) {
    return { ok: false, reason: summarizeError(error) };
  }
}
