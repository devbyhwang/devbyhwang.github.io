const LIMIT_PER_DAY = 3;
const RATE_TTL_SECONDS = 60 * 60 * 24 * 2;
const RATE_STORAGE_PREFIX = "rate:";
const RATE_GC_CURSOR_KEY = "gc:cursor";
const RATE_GC_BATCH_SIZE = 100;
const RATE_GC_ACTIVE_INTERVAL_MS = 15 * 1000;
const RATE_GC_IDLE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RATE_GC_RETRY_INTERVAL_MS = 60 * 1000;
const OPENAI_URL = "https://api.openai.com/v1/responses";
const GEMINI_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MANUSCRIPT_MAX_CHARS = 12000;
const REQUEST_CONTENT_LENGTH_MAX_BYTES = 32 * 1024;
const TURNSTILE_TOKEN_MAX_CHARS = 4096;
const NON_MANUSCRIPT_MAX_CHARS = 8000;
const PAYLOAD_TOO_LARGE_MESSAGE = "request fields exceed size limits";
const MAX_CHECKS_COUNT = 12;
const MAX_CHECK_ID_CHARS = 120;
const MAX_CHECK_LABEL_CHARS = 120;
const MAX_CHECK_QUESTION_CHARS = 400;
const MAX_CHECK_LOOKFOR_ITEMS = 8;
const MAX_CHECK_LOOKFOR_ITEM_CHARS = 240;
const MAX_SCORE_GUIDE_CHARS = 240;
const MAX_META_VERSION_CHARS = 16;
const MAX_META_NODE_ID_CHARS = 120;
const MAX_META_NODE_TITLE_CHARS = 200;
const MAX_META_NODE_KIND_CHARS = 32;
const MAX_META_NODE_LANE_CHARS = 32;
const MAX_META_CURRICULUM_STAGE_CHARS = 32;
const MAX_META_GENRE_CHARS = 64;
const MAX_META_DRAFT_STAGE_CHARS = 64;
const MAX_META_NARRATIVE_POV_CHARS = 64;
const MAX_META_AUTHOR_GOAL_CHARS = 500;
const MAX_META_MUST_KEEP_ITEMS = 20;
const MAX_META_MUST_KEEP_ITEM_CHARS = 120;
const MAX_PRESET_ID_CHARS = 32;
const MAX_PRESET_LABEL_CHARS = 64;
const MAX_PRESET_EDITOR_ROLE_CHARS = 200;
const MAX_PRESET_TONE_INSTRUCTION_CHARS = 500;
const MAX_PRESET_SUGGESTION_INSTRUCTION_CHARS = 500;
const MAX_LEGACY_PRESET_CHARS = 500;
const OWNER_BYPASS_HEADER = "X-Owner-Key";
const DEFAULT_TURNSTILE_ACTION = "novel_feedback";
const DEFAULT_AI_PROVIDER = "openai";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

class PayloadTooLargeError extends Error {}

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

    let contentLengthBytes;
    try {
      contentLengthBytes = readContentLengthBytes(request);
    } catch {
      return json(
        { error: { code: "BAD_REQUEST", message: "Invalid Content-Length header" } },
        400,
        origin,
        allowedOrigin
      );
    }
    if (contentLengthBytes !== null && contentLengthBytes > REQUEST_CONTENT_LENGTH_MAX_BYTES) {
      return payloadTooLarge(origin, allowedOrigin);
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

    // TEST_ONLY_OWNER_BYPASS_START
    const ownerBypassEnabled = env.ENABLE_OWNER_BYPASS === "true";
    const ownerBypassSecret =
      typeof env.OWNER_BYPASS_KEY === "string" ? env.OWNER_BYPASS_KEY.trim() : "";
    const ownerBypassCandidate = (request.headers.get(OWNER_BYPASS_HEADER) || "").trim();
    const isOwnerBypass = Boolean(
      ownerBypassEnabled &&
        ownerBypassSecret &&
        ownerBypassCandidate &&
        ownerBypassCandidate === ownerBypassSecret
    );
    // TEST_ONLY_OWNER_BYPASS_END

    const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken.trim() : "";
    if (turnstileToken.length > TURNSTILE_TOKEN_MAX_CHARS) {
      return payloadTooLarge(origin, allowedOrigin);
    }
    if (!isOwnerBypass && !turnstileToken) {
      return json(
        { error: { code: "BAD_REQUEST", message: "turnstileToken is required" } },
        400,
        origin,
        allowedOrigin
      );
    }

    if (!isOwnerBypass && !env.TURNSTILE_SECRET_KEY) {
      console.error("Missing TURNSTILE_SECRET_KEY secret");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "보안 검증 구성이 잘못되었습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    const clientId = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!isOwnerBypass) {
      const expectedHostname = resolveExpectedTurnstileHostname({
        explicitHostname: env.TURNSTILE_EXPECTED_HOSTNAME,
        allowedOrigin,
      });
      const expectedAction = resolveExpectedTurnstileAction(env.TURNSTILE_EXPECTED_ACTION);

      if (!expectedHostname) {
        console.error("Missing TURNSTILE_EXPECTED_HOSTNAME and ALLOWED_ORIGIN hostname fallback");
        return json(
          { error: { code: "UPSTREAM_ERROR", message: "보안 검증 구성이 잘못되었습니다." } },
          502,
          origin,
          allowedOrigin
        );
      }

      const turnstileResult = await verifyTurnstileToken({
        secret: env.TURNSTILE_SECRET_KEY,
        token: turnstileToken,
        remoteIp: clientId,
      });
      if (!turnstileResult.ok) {
        console.error("Turnstile verification failed", {
          reason: turnstileResult.reason,
          errors: turnstileResult.errorCodes,
        });
        return json(
          { error: { code: "INVALID_CAPTCHA", message: "보안 검증에 실패했습니다." } },
          403,
          origin,
          allowedOrigin
        );
      }

      if (turnstileResult.hostname !== expectedHostname) {
        console.error("Turnstile hostname mismatch", {
          expected: expectedHostname,
          actual: turnstileResult.hostname || "",
        });
        return json(
          { error: { code: "INVALID_CAPTCHA", message: "보안 검증에 실패했습니다." } },
          403,
          origin,
          allowedOrigin
        );
      }

      if (turnstileResult.action !== expectedAction) {
        console.error("Turnstile action mismatch", {
          expected: expectedAction,
          actual: turnstileResult.action || "",
        });
        return json(
          { error: { code: "INVALID_CAPTCHA", message: "보안 검증에 실패했습니다." } },
          403,
          origin,
          allowedOrigin
        );
      }
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
      return payloadTooLarge(origin, allowedOrigin);
    }

    let normalizedInput;
    try {
      normalizedInput = normalizeRequestPayload(payload);
      assertNonManuscriptBudget(normalizedInput);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return payloadTooLarge(origin, allowedOrigin);
      }
      return json(
        { error: { code: "BAD_REQUEST", message: summarizeError(error) } },
        400,
        origin,
        allowedOrigin
      );
    }

    let limit = { remainingToday: null };
    if (!isOwnerBypass) {
      const today = new Date().toISOString().slice(0, 10);
      const rateKey = `novel:${today}:${clientId}`;
      limit = await consumeRateLimit(env, {
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
    }

    const { checks, preset, meta } = normalizedInput;
    const prompt = buildPrompt({ manuscript, preset, checks, meta });
    const provider = resolveAiProvider(env);
    if (provider === "gemini" && !env.GEMINI_API_KEY) {
      console.error("Missing GEMINI_API_KEY secret");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 요청 구성이 잘못되었습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }
    if (provider === "openai" && !env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY secret");
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 요청 구성이 잘못되었습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    let result;
    if (provider === "gemini") {
      result = await callGemini({
        apiKey: env.GEMINI_API_KEY,
        model: resolveGeminiModel(env),
        prompt,
      });
    } else {
      result = await callOpenAi({
        apiKey: env.OPENAI_API_KEY,
        prompt,
      });
    }

    if (!result.ok) {
      if (result.reason === "network") {
        return json(
          { error: { code: "UPSTREAM_ERROR", message: "AI 서비스 연결에 실패했습니다." } },
          502,
          origin,
          allowedOrigin
        );
      }
      if (result.reason === "status") {
        return json(
          { error: { code: "UPSTREAM_ERROR", message: "AI 응답 생성에 실패했습니다." } },
          502,
          origin,
          allowedOrigin
        );
      }
      if (result.reason === "invalid_json") {
        return json(
          { error: { code: "UPSTREAM_ERROR", message: "AI 응답 처리에 실패했습니다." } },
          502,
          origin,
          allowedOrigin
        );
      }
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "AI 응답이 비어 있습니다." } },
        502,
        origin,
        allowedOrigin
      );
    }

    let normalized;
    try {
      normalized = normalizeModelPayload(JSON.parse(result.outputText));
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
          remainingToday:
            isOwnerBypass || !Number.isFinite(Number(limit.remainingToday))
              ? null
              : Math.max(0, Number(limit.remainingToday)),
          limitPerDay: isOwnerBypass ? null : LIMIT_PER_DAY,
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

  async alarm() {
    try {
      await this.runGarbageCollection(Date.now());
    } catch (error) {
      console.error("Rate limiter GC alarm failed", summarizeError(error));
      await this.state.storage.setAlarm(Date.now() + RATE_GC_RETRY_INTERVAL_MS);
    }
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

    const now = Date.now();
    await this.ensureGcAlarm(now);

    const storageKey = `${RATE_STORAGE_PREFIX}${key}`;
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

  async ensureGcAlarm(now, intervalMs = RATE_GC_IDLE_INTERVAL_MS) {
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm === null || currentAlarm <= now) {
      await this.state.storage.setAlarm(now + intervalMs);
    }
  }

  async runGarbageCollection(now) {
    const cursorRaw = await this.state.storage.get(RATE_GC_CURSOR_KEY);
    const startAfter =
      typeof cursorRaw === "string" && cursorRaw.startsWith(RATE_STORAGE_PREFIX) ? cursorRaw : undefined;
    const listOptions = {
      prefix: RATE_STORAGE_PREFIX,
      limit: RATE_GC_BATCH_SIZE,
    };
    if (startAfter) listOptions.startAfter = startAfter;
    const page = await this.state.storage.list(listOptions);

    let lastKey = "";
    let processed = 0;
    for (const [key, value] of page) {
      processed += 1;
      lastKey = key;
      if (value && typeof value.expiresAt === "number" && value.expiresAt <= now) {
        await this.state.storage.delete(key);
      }
    }

    if (processed >= RATE_GC_BATCH_SIZE && lastKey) {
      await this.state.storage.put(RATE_GC_CURSOR_KEY, lastKey);
      await this.state.storage.setAlarm(now + RATE_GC_ACTIVE_INTERVAL_MS);
      return;
    }

    await this.state.storage.delete(RATE_GC_CURSOR_KEY);
    await this.state.storage.setAlarm(now + RATE_GC_IDLE_INTERVAL_MS);
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
    "Access-Control-Allow-Headers": `Content-Type, ${OWNER_BYPASS_HEADER}`,
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

function payloadTooLarge(origin, allowedOrigin) {
  return json(
    { error: { code: "PAYLOAD_TOO_LARGE", message: PAYLOAD_TOO_LARGE_MESSAGE } },
    413,
    origin,
    allowedOrigin
  );
}

async function parseJson(request) {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function readContentLengthBytes(request) {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return null;
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("invalid_content_length");
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error("invalid_content_length");
  }
  return value;
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function assertMaxString(value, max, name) {
  if (typeof value !== "string") return;
  if (value.length > max) {
    throw new PayloadTooLargeError(`${name} exceeds ${max} chars`);
  }
}

function assertStringArrayLimit(value, { maxItems, maxItemChars, name }) {
  if (!Array.isArray(value)) return;
  if (value.length > maxItems) {
    throw new PayloadTooLargeError(`${name} exceeds ${maxItems} items`);
  }
  value.forEach((item, index) => {
    const text = typeof item === "string" ? item : "";
    if (text.length > maxItemChars) {
      throw new PayloadTooLargeError(`${name}[${index}] exceeds ${maxItemChars} chars`);
    }
  });
}

function assertNormalizedChecksWithinLimits(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error("checks must contain at least one rubric object");
  }
  if (checks.length > MAX_CHECKS_COUNT) {
    throw new PayloadTooLargeError(`checks exceeds ${MAX_CHECKS_COUNT} items`);
  }

  checks.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`checks[${index}] must be an object`);
    }
    const idLimit = typeof item.id === "string" && item.id.endsWith("__legacy")
      ? MAX_CHECK_ID_CHARS + "__legacy".length
      : MAX_CHECK_ID_CHARS;
    assertMaxString(item.id, idLimit, `checks[${index}].id`);
    assertMaxString(item.label, MAX_CHECK_LABEL_CHARS, `checks[${index}].label`);
    assertMaxString(item.question, MAX_CHECK_QUESTION_CHARS, `checks[${index}].question`);
    assertStringArrayLimit(item.lookFor, {
      maxItems: MAX_CHECK_LOOKFOR_ITEMS,
      maxItemChars: MAX_CHECK_LOOKFOR_ITEM_CHARS,
      name: `checks[${index}].lookFor`,
    });

    const guide = item.scoreGuide && typeof item.scoreGuide === "object" ? item.scoreGuide : {};
    assertMaxString(guide.high, MAX_SCORE_GUIDE_CHARS, `checks[${index}].scoreGuide.high`);
    assertMaxString(guide.mid, MAX_SCORE_GUIDE_CHARS, `checks[${index}].scoreGuide.mid`);
    assertMaxString(guide.low, MAX_SCORE_GUIDE_CHARS, `checks[${index}].scoreGuide.low`);
  });
}

function assertNormalizedMetaWithinLimits(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("meta must be an object");
  }
  assertMaxString(meta.version, MAX_META_VERSION_CHARS, "meta.version");
  assertMaxString(meta.nodeId, MAX_META_NODE_ID_CHARS, "meta.nodeId");
  assertMaxString(meta.nodeTitle, MAX_META_NODE_TITLE_CHARS, "meta.nodeTitle");
  assertMaxString(meta.nodeKind, MAX_META_NODE_KIND_CHARS, "meta.nodeKind");
  assertMaxString(meta.nodeLane, MAX_META_NODE_LANE_CHARS, "meta.nodeLane");
  assertMaxString(meta.curriculumStage, MAX_META_CURRICULUM_STAGE_CHARS, "meta.curriculumStage");
  assertMaxString(meta.genre, MAX_META_GENRE_CHARS, "meta.genre");
  assertMaxString(meta.draftStage, MAX_META_DRAFT_STAGE_CHARS, "meta.draftStage");
  assertMaxString(meta.narrativePOV, MAX_META_NARRATIVE_POV_CHARS, "meta.narrativePOV");
  assertMaxString(meta.authorGoal, MAX_META_AUTHOR_GOAL_CHARS, "meta.authorGoal");
  assertStringArrayLimit(meta.mustKeep, {
    maxItems: MAX_META_MUST_KEEP_ITEMS,
    maxItemChars: MAX_META_MUST_KEEP_ITEM_CHARS,
    name: "meta.mustKeep",
  });
}

function assertNormalizedPresetWithinLimits(preset) {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
    throw new Error("preset must be an object");
  }
  assertMaxString(preset.id, MAX_PRESET_ID_CHARS, "preset.id");
  assertMaxString(preset.label, MAX_PRESET_LABEL_CHARS, "preset.label");
  assertMaxString(preset.editorRole, MAX_PRESET_EDITOR_ROLE_CHARS, "preset.editorRole");
  assertMaxString(
    preset.toneInstruction,
    preset.__isLegacy ? MAX_PRESET_TONE_INSTRUCTION_CHARS + MAX_LEGACY_PRESET_CHARS : MAX_PRESET_TONE_INSTRUCTION_CHARS,
    "preset.toneInstruction"
  );
  assertMaxString(preset.suggestionInstruction, MAX_PRESET_SUGGESTION_INSTRUCTION_CHARS, "preset.suggestionInstruction");
}

function assertNonManuscriptBudget({ checks, meta, preset }) {
  assertNormalizedChecksWithinLimits(checks);
  assertNormalizedMetaWithinLimits(meta);
  assertNormalizedPresetWithinLimits(preset);

  const payloadSize = JSON.stringify({ checks, meta, preset }).length;
  if (payloadSize > NON_MANUSCRIPT_MAX_CHARS) {
    throw new PayloadTooLargeError(`non-manuscript payload exceeds ${NON_MANUSCRIPT_MAX_CHARS} chars`);
  }
}

function getDefaultPreset(id = "balanced") {
  const presets = {
    strict: {
      id: "strict",
      label: "엄격하게",
      editorRole: "약점과 누락을 먼저 짚는 웹소설 편집자",
      toneInstruction: "칭찬보다 문제 진단을 앞세우고, 표현은 단호하게 유지한다.",
      suggestionInstruction: "수정안은 우선순위가 가장 높은 문제부터 바로 고칠 수 있게 제시한다.",
    },
    balanced: {
      id: "balanced",
      label: "균형 있게",
      editorRole: "강점과 약점을 함께 보되 실전 수정 우선순위를 잡아주는 웹소설 편집자",
      toneInstruction: "강점은 짧게 인정하되, 개선 포인트와 누락된 기능을 분명하게 짚는다.",
      suggestionInstruction: "수정안은 바로 장면이나 문단에 적용할 수 있는 수준으로 구체화한다.",
    },
    supportive: {
      id: "supportive",
      label: "격려형",
      editorRole: "초보자도 받아들일 수 있게 설명하되 기준은 흐리지 않는 웹소설 편집자",
      toneInstruction: "표현은 부드럽게 하되, 문제 자체를 완화하거나 모호하게 돌려 말하지 않는다.",
      suggestionInstruction: "수정안은 부담을 줄이되, 무엇을 줄이고 무엇을 보강할지 분명히 적는다.",
    },
  };
  return presets[id] || presets.balanced;
}

function getNodeIdFromCheckId(checkId) {
  if (typeof checkId !== "string") return "";
  return checkId.split("__")[0] || "";
}

function normalizeStructuredChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error("checks must contain at least one rubric object");
  }

  return checks.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`checks[${index}] must be an object`);
    }

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const lookFor = normalizeStringArray(item.lookFor);
    const rawGuide = item.scoreGuide && typeof item.scoreGuide === "object" ? item.scoreGuide : {};
    const scoreGuide = {
      high: typeof rawGuide.high === "string" ? rawGuide.high.trim() : "",
      mid: typeof rawGuide.mid === "string" ? rawGuide.mid.trim() : "",
      low: typeof rawGuide.low === "string" ? rawGuide.low.trim() : "",
    };

    if (!id || !label || !question) {
      throw new Error(`checks[${index}] is missing id, label, or question`);
    }

    return {
      id,
      label,
      question,
      lookFor,
      scoreGuide,
    };
  });
}

function buildLegacyFallbackCheck(nodeId, meta = {}) {
  const label = typeof meta.nodeTitle === "string" && meta.nodeTitle.trim() ? meta.nodeTitle.trim() : nodeId;
  return {
    id: `${nodeId}__legacy`,
    label,
    question: "이 노드의 핵심 기능이 현재 원고에서 분명하게 작동하는가?",
    lookFor: [
      "선택 노드의 목표와 통과 기준이 원고 안에서 확인된다",
      "독자가 다음 장면 또는 다음 단락으로 끌려갈 이유가 생긴다",
    ],
    scoreGuide: {
      high: "노드 기능이 선명하고 원고 근거가 충분하다.",
      mid: "핵심은 있으나 선명도나 압력이 약하다.",
      low: "노드 기능이 흐리거나 거의 작동하지 않는다.",
    },
  };
}

function normalizeLegacyChecks(checks, meta) {
  const legacyIds = Array.isArray(checks)
    ? checks.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  assertStringArrayLimit(legacyIds, {
    maxItems: MAX_CHECKS_COUNT,
    maxItemChars: MAX_CHECK_ID_CHARS,
    name: "checks",
  });
  const nodeId = meta.nodeId || legacyIds[0];
  if (!nodeId) {
    throw new Error("meta.nodeId is required when checks are not structured");
  }
  return [buildLegacyFallbackCheck(nodeId, meta)];
}

function normalizePreset(preset) {
  if (preset && typeof preset === "object" && !Array.isArray(preset)) {
    assertMaxString(typeof preset.id === "string" ? preset.id.trim() : "", MAX_PRESET_ID_CHARS, "preset.id");
    assertMaxString(typeof preset.label === "string" ? preset.label.trim() : "", MAX_PRESET_LABEL_CHARS, "preset.label");
    assertMaxString(
      typeof preset.editorRole === "string" ? preset.editorRole.trim() : "",
      MAX_PRESET_EDITOR_ROLE_CHARS,
      "preset.editorRole"
    );
    assertMaxString(
      typeof preset.toneInstruction === "string" ? preset.toneInstruction.trim() : "",
      MAX_PRESET_TONE_INSTRUCTION_CHARS,
      "preset.toneInstruction"
    );
    assertMaxString(
      typeof preset.suggestionInstruction === "string" ? preset.suggestionInstruction.trim() : "",
      MAX_PRESET_SUGGESTION_INSTRUCTION_CHARS,
      "preset.suggestionInstruction"
    );

    const base = getDefaultPreset(typeof preset.id === "string" ? preset.id.trim() : "balanced");
    return {
      id: base.id,
      label: typeof preset.label === "string" && preset.label.trim() ? preset.label.trim() : base.label,
      editorRole: typeof preset.editorRole === "string" && preset.editorRole.trim() ? preset.editorRole.trim() : base.editorRole,
      toneInstruction: typeof preset.toneInstruction === "string" && preset.toneInstruction.trim() ? preset.toneInstruction.trim() : base.toneInstruction,
      suggestionInstruction:
        typeof preset.suggestionInstruction === "string" && preset.suggestionInstruction.trim()
          ? preset.suggestionInstruction.trim()
          : base.suggestionInstruction,
    };
  }

  if (typeof preset === "string" && preset.trim()) {
    const legacyInstruction = preset.trim();
    assertMaxString(legacyInstruction, MAX_LEGACY_PRESET_CHARS, "preset");
    const base = getDefaultPreset("balanced");
    const normalized = {
      ...base,
      toneInstruction: `${base.toneInstruction} 추가 참고: ${legacyInstruction}`,
    };
    Object.defineProperty(normalized, "__isLegacy", {
      value: true,
      enumerable: false,
      configurable: false,
    });
    return normalized;
  }

  return getDefaultPreset("balanced");
}

function normalizeMeta(meta, checks = [], options = {}) {
  const { requireNodeId = true } = options;
  const source = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const lang = source.lang === "en" ? "en" : "ko";
  const fallbackNodeId = checks[0] ? getNodeIdFromCheckId(checks[0].id) : "";
  const nodeId = typeof source.nodeId === "string" && source.nodeId.trim() ? source.nodeId.trim() : fallbackNodeId;
  if (requireNodeId && !nodeId) {
    throw new Error("meta.nodeId is required");
  }

  return {
    lang,
    version: typeof source.version === "string" && source.version.trim() ? source.version.trim() : "v3",
    nodeId,
    nodeTitle: typeof source.nodeTitle === "string" ? source.nodeTitle.trim() : "",
    nodeKind: typeof source.nodeKind === "string" ? source.nodeKind.trim() : "drill",
    nodeLane: typeof source.nodeLane === "string" ? source.nodeLane.trim() : "",
    curriculumStage: typeof source.curriculumStage === "string" ? source.curriculumStage.trim() : "",
    genre: typeof source.genre === "string" ? source.genre.trim() : "",
    draftStage: typeof source.draftStage === "string" ? source.draftStage.trim() : "",
    narrativePOV: typeof source.narrativePOV === "string" ? source.narrativePOV.trim() : "",
    authorGoal: typeof source.authorGoal === "string" ? source.authorGoal.trim() : "",
    mustKeep: normalizeStringArray(source.mustKeep),
  };
}

function normalizeRequestPayload(payload) {
  const provisionalMeta = normalizeMeta(payload?.meta, [], { requireNodeId: false });
  const checks =
    Array.isArray(payload?.checks) && payload.checks.length > 0 && typeof payload.checks[0] === "object"
      ? normalizeStructuredChecks(payload.checks)
      : normalizeLegacyChecks(payload?.checks, provisionalMeta);
  const meta = normalizeMeta(payload?.meta, checks);
  const preset = normalizePreset(payload?.preset);
  return { checks, preset, meta };
}

function buildPrompt({ manuscript, preset, checks, meta }) {
  const isEn = meta.lang === "en";
  if (isEn) {
    return [
      "# System Role",
      "You are a professional web-fiction editor who evaluates drafts with practical commercial standards.",
      "Read the manuscript and assess only the selected node using the provided rubric.",
      "You must reflect both meta context and preset instructions.",
      "",
      "Editorial rules:",
      "- Prioritize evidence-based diagnosis over vague praise or impressionistic commentary.",
      "- Do not invent missing information.",
      "- Every evaluation must rely on the rubric's question, lookFor, and scoreGuide.",
      "- Suggestions must be immediately actionable at scene, paragraph, or revision-plan level.",
      "- Prefer telling the author what to cut, add, sharpen, or reorder.",
      "",
      "# Context Meta",
      "Reflect the following story context in your evaluation.",
      "meta:",
      prettyJson(meta),
      "",
      "Interpretation rules:",
      "- Prioritize genre, draftStage, narrativePOV, authorGoal, and mustKeep.",
      "- If mustKeep exists, preserve those elements and improve around them instead of suggesting removal first.",
      "- If authorGoal exists, prioritize issues directly related to that goal.",
      "",
      "# Feedback Preset",
      "Follow this feedback mode.",
      "preset:",
      prettyJson(preset),
      "",
      "Preset rules:",
      "- strict: lead with weaknesses and missing craft moves in a firm tone.",
      "- balanced: acknowledge strengths briefly, then clarify revision priorities.",
      "- supportive: stay encouraging, but do not blur the diagnosis itself.",
      "",
      "# Evaluation Criteria",
      "Use only the following rubrics.",
      "checks:",
      prettyJson(checks),
      "",
      "Scoring rules:",
      "- Each score must be a number from 0 to 10.",
      "- Use the closest high/mid/low scoreGuide when scoring.",
      "- Evidence must describe only verifiable facts from the manuscript.",
      "- Suggestion must focus on the single highest-leverage revision move for that rubric.",
      "- Do not expand into unrelated craft areas.",
      "",
      "# Output Requirements",
      "Return JSON only.",
      "Do not include markdown, code fences, commentary, introduction, or closing remarks.",
      "Use this exact schema:",
      prettyJson({
        overallScore: 7.5,
        summary: "One-line node-level summary",
        items: [
          {
            id: "check id",
            label: "check label",
            score: 8,
            evidence: ["Concrete evidence 1", "Concrete evidence 2"],
            suggestion: "Specific actionable revision",
          },
        ],
      }),
      "",
      "Output rules:",
      "- overallScore is the node-level composite score.",
      "- summary must be a single line focused on the selected node.",
      "- items must preserve the checks order.",
      "- evidence must contain 1 to 3 strings per item.",
      "- label and id must match the provided checks exactly.",
      "",
      "# Scoring Calibration",
      "- 9~10: The node works with exceptional clarity and immediate reader impact.",
      "- 7~8: The node mostly works, but some sharpness or pressure is missing.",
      "- 5~6: The intent exists, but execution is partial or inconsistent.",
      "- 3~4: The node only partially functions and is hard for readers to feel.",
      "- 0~2: The node is mostly absent or works against the intended effect.",
      "",
      "# Manuscript",
      "Evaluate only the manuscript below.",
      manuscript,
    ].join("\n");
  }

  return [
    "# System Role",
    "당신은 웹소설 원고를 실전 기준으로 점검하는 전문 편집자다.",
    "주어진 원고를 읽고, 선택된 노드의 평가 기준만 엄격하게 적용해 분석한다.",
    "작품 맥락(meta)과 피드백 방식(preset)을 반드시 반영한다.",
    "",
    "편집 원칙:",
    "- 추상적인 감상이나 막연한 칭찬보다, 원고에 근거한 진단을 우선한다.",
    "- 보이지 않는 정보는 추정하지 않는다.",
    "- 각 평가는 반드시 해당 루브릭의 question/lookFor/scoreGuide에 근거해 작성한다.",
    "- suggestion은 작가가 바로 수정에 옮길 수 있도록 구체적으로 쓴다.",
    "- suggestion에는 가능하면 무엇을 줄이고, 무엇을 추가하고, 무엇을 더 선명하게 해야 하는지가 드러나야 한다.",
    "- 원고에 없는 내용을 새로 설정해 단정하지 말고, 현재 원고에서 보완해야 할 방향으로 제안한다.",
    "",
    "# Context Meta",
    "다음 작품 맥락을 평가에 반영한다.",
    "meta:",
    prettyJson(meta),
    "",
    "해석 규칙:",
    "- genre, draftStage, narrativePOV, authorGoal, mustKeep를 우선 참고한다.",
    "- mustKeep에 포함된 요소는 제거 제안 대신 보존한 채 개선하는 방향을 우선한다.",
    "- authorGoal이 있으면 해당 목표와 직접 관련된 문제를 우선순위 높게 다룬다.",
    "",
    "# Feedback Preset",
    "다음 피드백 방식을 따른다.",
    "preset:",
    prettyJson(preset),
    "",
    "적용 규칙:",
    "- strict: 약점과 누락을 먼저 짚고, 표현은 단호하게 한다.",
    "- balanced: 강점이 있으면 짧게 인정하되, 개선 우선순위를 분명히 제시한다.",
    "- supportive: 위축되지 않도록 표현하되, 문제 진단 자체는 흐리지 않는다.",
    "",
    "# Evaluation Criteria",
    "다음 평가 기준(rubric)만 사용해 채점한다.",
    "checks:",
    prettyJson(checks),
    "",
    "채점 규칙:",
    "- 각 check마다 score는 0~10 사이 숫자로 작성한다.",
    "- high/mid/low 가이드를 참고해 가장 가까운 수준으로 점수를 준다.",
    "- evidence는 해당 루브릭의 question/lookFor를 근거로, 현재 원고에서 확인된 사실만 간결하게 설명한다.",
    "- suggestion은 해당 루브릭 점수를 가장 효율적으로 끌어올릴 수정 방향을 1~3문장으로 제시한다.",
    "- 루브릭 밖의 항목은 장황하게 확장하지 않는다.",
    "",
    "# Output Requirements",
    "반드시 JSON으로만 응답한다.",
    "마크다운, 코드블록, 해설 문장, 서문, 후문을 절대 포함하지 않는다.",
    "반드시 아래 스키마를 따른다:",
    prettyJson({
      overallScore: 7.5,
      summary: "선택 노드 기준의 전반적 총평 한 줄",
      items: [
        {
          id: "check id",
          label: "check label",
          score: 8,
          evidence: ["원고에서 확인된 근거 1", "원고에서 확인된 근거 2"],
          suggestion: "바로 수정 가능한 구체적 제안",
        },
      ],
    }),
    "",
    "출력 규칙:",
    "- overallScore는 items의 평가를 종합한 노드 단위 점수다.",
    "- summary는 선택 노드 관점의 총평만 한 줄로 쓴다.",
    "- items는 checks 순서를 유지한다.",
    "- evidence는 각 항목당 1~3개 문자열 배열로 작성한다.",
    "- evidence는 추상 표현보다 장면 기능, 정보 배치, 충돌, 감정 변화 등 관찰 가능한 근거를 우선한다.",
    "- suggestion은 preset의 톤을 따르되, 모호한 표현만으로 끝내지 않는다.",
    "- suggestion에서는 우선순위가 가장 높은 수정 포인트를 먼저 말한다.",
    "- label은 checks에 제공된 label을 그대로 사용한다.",
    "- id는 checks에 제공된 id를 그대로 사용한다.",
    "",
    "# Scoring Calibration",
    "- 9~10: 노드 목적이 매우 선명하고, 독자가 즉시 체감할 수준으로 잘 작동한다.",
    "- 7~8: 기능은 대체로 성립하지만, 선명도나 압력이 부족한 부분이 있다.",
    "- 5~6: 핵심 의도는 보이나 실제 작동이 약하거나 누락이 있다.",
    "- 3~4: 노드 기능이 부분적으로만 보이며 독자가 체감하기 어렵다.",
    "- 0~2: 해당 노드 기능이 거의 보이지 않거나 반대로 작동한다.",
    "",
    "# Manuscript",
    "아래 원고만 읽고 평가한다.",
    manuscript,
  ].join("\n");
}

function resolveAiProvider(env) {
  const value = typeof env.AI_PROVIDER === "string" ? env.AI_PROVIDER.trim().toLowerCase() : "";
  if (value === "openai") return "openai";
  if (value === "gemini") return "gemini";
  return DEFAULT_AI_PROVIDER;
}

function resolveGeminiModel(env) {
  const value = typeof env.GEMINI_MODEL === "string" ? env.GEMINI_MODEL.trim() : "";
  return value || DEFAULT_GEMINI_MODEL;
}

async function callGemini({ apiKey, model, prompt }) {
  let response;
  const url = `${GEMINI_URL_BASE}/${encodeURIComponent(model)}:generateContent`;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequest(prompt)),
    });
  } catch (error) {
    console.error("Gemini request failed", summarizeError(error));
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    console.error("Gemini upstream status", response.status);
    return { ok: false, reason: "status" };
  }

  let geminiJson;
  try {
    geminiJson = await response.json();
  } catch (error) {
    console.error("Gemini JSON parse failed", summarizeError(error));
    return { ok: false, reason: "invalid_json" };
  }

  const outputText = extractGeminiText(geminiJson);
  if (!outputText) {
    console.error("Gemini output text missing");
    return { ok: false, reason: "empty_output" };
  }

  return { ok: true, outputText };
}

async function callOpenAi({ apiKey, prompt }) {
  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiRequest(prompt)),
    });
  } catch (error) {
    console.error("OpenAI request failed", summarizeError(error));
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    console.error("OpenAI upstream status", response.status);
    return { ok: false, reason: "status" };
  }

  let openAiJson;
  try {
    openAiJson = await response.json();
  } catch (error) {
    console.error("OpenAI JSON parse failed", summarizeError(error));
    return { ok: false, reason: "invalid_json" };
  }

  const outputText = extractOpenAiText(openAiJson);
  if (!outputText) {
    console.error("OpenAI output_text missing");
    return { ok: false, reason: "empty_output" };
  }

  return { ok: true, outputText };
}

function buildGeminiRequest(prompt) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiResponseSchema(),
    },
  };
}

function buildOpenAiRequest(prompt) {
  return {
    model: "gpt-4o-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "novel_feedback",
        schema: buildOpenAiResponseSchema(),
      },
    },
  };
}

function buildOpenAiResponseSchema() {
  return {
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
  };
}

function buildGeminiResponseSchema() {
  return {
    type: "OBJECT",
    required: ["overallScore", "summary", "items"],
    properties: {
      overallScore: { type: "NUMBER" },
      summary: { type: "STRING" },
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          required: ["id", "label", "score", "evidence", "suggestion"],
          properties: {
            id: { type: "STRING" },
            label: { type: "STRING" },
            score: { type: "NUMBER" },
            evidence: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            suggestion: { type: "STRING" },
          },
        },
      },
    },
  };
}

function extractOpenAiText(openAiJson) {
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

function extractGeminiText(geminiJson) {
  if (!Array.isArray(geminiJson?.candidates)) {
    return "";
  }

  const texts = [];
  for (const candidate of geminiJson.candidates) {
    if (!Array.isArray(candidate?.content?.parts)) continue;
    for (const part of candidate.content.parts) {
      if (typeof part?.text === "string") {
        texts.push(part.text);
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
    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
        hostname: "",
        action: "",
        errorCodes: [],
      };
    }
    const data = await response.json();
    const hostname = typeof data?.hostname === "string" ? data.hostname : "";
    const action = typeof data?.action === "string" ? data.action : "";
    const errorCodes = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].filter((code) => typeof code === "string")
      : [];
    return {
      ok: data?.success === true,
      reason: data?.success === true ? "ok" : "unsuccessful",
      hostname,
      action,
      errorCodes,
    };
  } catch (error) {
    console.error("Turnstile verify failed", summarizeError(error));
    return {
      ok: false,
      reason: "network_error",
      hostname: "",
      action: "",
      errorCodes: [],
    };
  }
}

function resolveExpectedTurnstileHostname({ explicitHostname, allowedOrigin }) {
  const explicit = typeof explicitHostname === "string" ? explicitHostname.trim() : "";
  if (explicit) return explicit;

  try {
    if (!allowedOrigin) return "";
    return new URL(allowedOrigin).hostname;
  } catch {
    return "";
  }
}

function resolveExpectedTurnstileAction(value) {
  const action = typeof value === "string" ? value.trim() : "";
  return action || DEFAULT_TURNSTILE_ACTION;
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

export { buildPrompt, normalizeModelPayload, normalizeRequestPayload };
