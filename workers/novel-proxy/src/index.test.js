import test from "node:test";
import assert from "node:assert/strict";

import worker, {
  buildPrompt,
  normalizeModelPayload,
  normalizeRequestPayload,
  RateLimiterDO,
} from "./index.js";

const ALLOWED_ORIGIN = "https://devbyhwang.github.io";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function makeWorkerRequest({
  method = "POST",
  origin = ALLOWED_ORIGIN,
  ownerKey = "",
  ip = "203.0.113.5",
  headers: extraHeaders = {},
  body = {},
  rawBody,
} = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (origin) headers.set("Origin", origin);
  if (ip) headers.set("CF-Connecting-IP", ip);
  if (ownerKey) headers.set("X-Owner-Key", ownerKey);

  return new Request("https://novel-proxy.devbyhwang.workers.dev/v1/novel-feedback", {
    method,
    headers,
    body: method === "POST" ? (rawBody === undefined ? JSON.stringify(body) : rawBody) : null,
  });
}

function makeRateLimiterBinding(responsePayload, responseStatus = 200) {
  return {
    idFromName(key) {
      return key;
    },
    get() {
      return {
        async fetch() {
          return new Response(JSON.stringify(responsePayload), {
            status: responseStatus,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        },
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN,
    ENABLE_OWNER_BYPASS: "false",
    OWNER_BYPASS_KEY: "test-owner-key",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    TURNSTILE_EXPECTED_HOSTNAME: "devbyhwang.github.io",
    TURNSTILE_EXPECTED_ACTION: "novel_feedback",
    RATE_LIMITER: makeRateLimiterBinding({
      ok: true,
      allowed: true,
      remainingToday: 2,
    }),
    ...overrides,
  };
}

function makeDoState(initialEntries = [], initialAlarm = null) {
  const data = new Map(initialEntries);
  let alarmAt = initialAlarm;
  const setAlarmCalls = [];

  const storage = {
    data,
    setAlarmCalls,
    async get(key) {
      return data.get(key);
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    async list(options = {}) {
      const prefix = typeof options.prefix === "string" ? options.prefix : "";
      const startAfter = typeof options.startAfter === "string" ? options.startAfter : "";
      const limit = Number.isFinite(options.limit) ? Number(options.limit) : Number.POSITIVE_INFINITY;
      const keys = [...data.keys()].filter((key) => key.startsWith(prefix)).sort();

      const rows = new Map();
      for (const key of keys) {
        if (startAfter && key <= startAfter) continue;
        rows.set(key, data.get(key));
        if (rows.size >= limit) break;
      }
      return rows;
    },
    async getAlarm() {
      return alarmAt;
    },
    async setAlarm(scheduledTime) {
      alarmAt = Number(scheduledTime);
      setAlarmCalls.push(alarmAt);
    },
  };

  return { storage };
}

function installTurnstileMock(t, payload, status = 200) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url === TURNSTILE_VERIFY_URL) {
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

function makeValidPayload(overrides = {}) {
  return {
    turnstileToken: "valid-turnstile-token",
    manuscript: "테스트 원고",
    checks: ["s1_lock_lead"],
    meta: {
      lang: "ko",
      version: "v3",
      nodeId: "s1_lock_lead",
      nodeTitle: "LOCK: Lead",
    },
    ...overrides,
  };
}

function makeStructuredCheck(overrides = {}) {
  return {
    id: "s1_lock_lead__goal",
    label: "장면 목표",
    question: "이 장면의 목표가 분명한가?",
    lookFor: ["장면 초반 목표 제시"],
    scoreGuide: {
      high: "명확하다.",
      mid: "부분적으로 보인다.",
      low: "흐리다.",
    },
    ...overrides,
  };
}

test("normalizeRequestPayload accepts structured rubric payloads", () => {
  const payload = normalizeRequestPayload({
    checks: [
      {
        id: "s2_scene_goal_conflict_change__goal",
        label: "장면 목표",
        question: "이 장면에서 인물의 즉시 목표가 선명한가?",
        lookFor: ["장면 초반 목표 제시"],
        scoreGuide: {
          high: "명확하다.",
          mid: "부분적으로 보인다.",
          low: "흐리다.",
        },
      },
    ],
    meta: {
      lang: "ko",
      version: "v3",
      nodeId: "s2_scene_goal_conflict_change",
      nodeTitle: "장면 목적-충돌-변화",
    },
    preset: {
      id: "balanced",
      label: "균형 있게",
      editorRole: "실전적인 웹소설 편집자",
      toneInstruction: "강점은 짧게 인정하되 개선 우선순위를 제시한다.",
      suggestionInstruction: "수정안을 구체적으로 쓴다.",
    },
  });

  assert.equal(payload.meta.nodeId, "s2_scene_goal_conflict_change");
  assert.equal(payload.checks.length, 1);
  assert.equal(payload.checks[0].id, "s2_scene_goal_conflict_change__goal");
  assert.equal(payload.preset.id, "balanced");
});

test("normalizeRequestPayload upgrades legacy string checks", () => {
  const payload = normalizeRequestPayload({
    checks: ["s1_lock_lead"],
    meta: {
      lang: "ko",
      nodeId: "s1_lock_lead",
      nodeTitle: "LOCK: Lead",
    },
    preset: "출력 형식: 간결하게",
  });

  assert.equal(payload.checks.length, 1);
  assert.equal(payload.checks[0].id, "s1_lock_lead__legacy");
  assert.equal(payload.preset.id, "balanced");
  assert.match(payload.preset.toneInstruction, /추가 참고/);
});

test("buildPrompt includes the planned sections", () => {
  const prompt = buildPrompt({
    manuscript: "원고 본문",
    checks: [
      {
        id: "s2_scene_goal_conflict_change__goal",
        label: "장면 목표",
        question: "질문",
        lookFor: ["근거"],
        scoreGuide: { high: "상", mid: "중", low: "하" },
      },
    ],
    meta: {
      lang: "ko",
      version: "v3",
      nodeId: "s2_scene_goal_conflict_change",
      nodeTitle: "장면 목적-충돌-변화",
      nodeKind: "drill",
      nodeLane: "middle",
      curriculumStage: "s2",
      genre: "미정",
      draftStage: "초고",
      narrativePOV: "미정",
      authorGoal: "",
      mustKeep: [],
    },
    preset: {
      id: "balanced",
      label: "균형 있게",
      editorRole: "실전적인 웹소설 편집자",
      toneInstruction: "강점은 짧게 인정하되 개선 우선순위를 제시한다.",
      suggestionInstruction: "수정안을 구체적으로 쓴다.",
    },
  });

  assert.match(prompt, /# System Role/);
  assert.match(prompt, /# Context Meta/);
  assert.match(prompt, /# Feedback Preset/);
  assert.match(prompt, /# Evaluation Criteria/);
  assert.match(prompt, /# Output Requirements/);
  assert.match(prompt, /# Scoring Calibration/);
  assert.match(prompt, /# Manuscript/);
});

test("normalizeModelPayload rejects invalid score types", () => {
  assert.throws(
    () =>
      normalizeModelPayload({
        overallScore: 7.5,
        summary: "요약",
        items: [
          {
            id: "check",
            label: "체크",
            score: "bad",
            evidence: [],
            suggestion: "수정",
          },
        ],
      }),
    /item score invalid/
  );
});

test("owner bypass header alone is rejected when bypass is disabled", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: {},
    }),
    {
      ALLOWED_ORIGIN,
      ENABLE_OWNER_BYPASS: "false",
      OWNER_BYPASS_KEY: "test-owner-key",
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload?.error?.code, "BAD_REQUEST");
  assert.equal(payload?.error?.message, "turnstileToken is required");
});

test("owner bypass skips turnstile token requirement when enabled and key matches", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: {},
    }),
    {
      ALLOWED_ORIGIN,
      ENABLE_OWNER_BYPASS: "true",
      OWNER_BYPASS_KEY: "test-owner-key",
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload?.error?.code, "BAD_REQUEST");
  assert.equal(payload?.error?.message, "manuscript is required");
});

test("CORS preflight returns allow-origin for allowed origin", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      method: "OPTIONS",
      body: undefined,
    }),
    makeEnv()
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
});

test("handler blocks disallowed origin", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      origin: "https://evil.example",
      body: {},
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload?.error?.code, "FORBIDDEN_ORIGIN");
});

test("handler rejects non-json content type", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      headers: { "Content-Type": "text/plain" },
      body: {},
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 415);
  assert.equal(payload?.error?.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("content-length above 32KB returns PAYLOAD_TOO_LARGE before JSON parse", async () => {
  const overLimitBody = "x".repeat(32 * 1024 + 1);
  const response = await worker.fetch(
    makeWorkerRequest({
      headers: { "Content-Length": String(overLimitBody.length) },
      rawBody: overLimitBody,
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("content-length exactly 32KB is not preblocked and falls through to JSON parse", async () => {
  const boundaryBody = "x".repeat(32 * 1024);
  const response = await worker.fetch(
    makeWorkerRequest({
      headers: { "Content-Length": String(boundaryBody.length) },
      rawBody: boundaryBody,
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload?.error?.code, "BAD_REQUEST");
  assert.equal(payload?.error?.message, "Invalid JSON payload");
});

test("malformed content-length returns BAD_REQUEST", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      headers: { "Content-Length": "32kb" },
      body: {},
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload?.error?.code, "BAD_REQUEST");
  assert.equal(payload?.error?.message, "Invalid Content-Length header");
});

test("turnstile unsuccessful response returns INVALID_CAPTCHA", async (t) => {
  installTurnstileMock(t, {
    success: false,
    hostname: "devbyhwang.github.io",
    action: "novel_feedback",
    "error-codes": ["invalid-input-response"],
  });

  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload({ manuscript: "" }),
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload?.error?.code, "INVALID_CAPTCHA");
});

test("turnstile hostname mismatch returns INVALID_CAPTCHA", async (t) => {
  installTurnstileMock(t, {
    success: true,
    hostname: "mismatch.example",
    action: "novel_feedback",
  });

  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload({ manuscript: "" }),
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload?.error?.code, "INVALID_CAPTCHA");
});

test("turnstile action mismatch returns INVALID_CAPTCHA", async (t) => {
  installTurnstileMock(t, {
    success: true,
    hostname: "devbyhwang.github.io",
    action: "other_action",
  });

  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload({ manuscript: "" }),
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload?.error?.code, "INVALID_CAPTCHA");
});

test("rate limit denied returns RATE_LIMITED with usage payload", async (t) => {
  installTurnstileMock(t, {
    success: true,
    hostname: "devbyhwang.github.io",
    action: "novel_feedback",
  });

  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload(),
    }),
    makeEnv({
      RATE_LIMITER: makeRateLimiterBinding({
        ok: true,
        allowed: false,
        remainingToday: 0,
      }),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 429);
  assert.equal(payload?.error?.code, "RATE_LIMITED");
  assert.equal(payload?.usage?.remainingToday, 0);
});

test("rate limiter upstream error returns UPSTREAM_ERROR", async (t) => {
  installTurnstileMock(t, {
    success: true,
    hostname: "devbyhwang.github.io",
    action: "novel_feedback",
  });

  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload(),
    }),
    makeEnv({
      RATE_LIMITER: makeRateLimiterBinding(
        {
          ok: false,
          reason: "invalid_response",
        },
        200
      ),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload?.error?.code, "UPSTREAM_ERROR");
});

test("checks count over limit returns PAYLOAD_TOO_LARGE", async () => {
  const checks = Array.from({ length: 13 }, (_, index) =>
    makeStructuredCheck({
      id: `s1_lock_lead__check_${index}`,
      label: `체크 ${index}`,
    })
  );
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        checks,
        meta: {
          lang: "ko",
          version: "v3",
          nodeId: "s1_lock_lead",
          nodeTitle: "LOCK: Lead",
        },
      }),
    }),
    makeEnv({ ENABLE_OWNER_BYPASS: "true" })
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("structured check question over limit returns PAYLOAD_TOO_LARGE", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        checks: [
          makeStructuredCheck({
            question: "q".repeat(401),
          }),
        ],
      }),
    }),
    makeEnv({ ENABLE_OWNER_BYPASS: "true" })
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("meta.authorGoal over limit returns PAYLOAD_TOO_LARGE", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        meta: {
          lang: "ko",
          version: "v3",
          nodeId: "s1_lock_lead",
          nodeTitle: "LOCK: Lead",
          authorGoal: "a".repeat(501),
        },
      }),
    }),
    makeEnv({ ENABLE_OWNER_BYPASS: "true" })
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("meta.mustKeep count over limit returns PAYLOAD_TOO_LARGE", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        meta: {
          lang: "ko",
          version: "v3",
          nodeId: "s1_lock_lead",
          nodeTitle: "LOCK: Lead",
          mustKeep: Array.from({ length: 21 }, (_, i) => `must-keep-${i}`),
        },
      }),
    }),
    makeEnv({ ENABLE_OWNER_BYPASS: "true" })
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("preset.toneInstruction over limit returns PAYLOAD_TOO_LARGE", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        preset: {
          id: "balanced",
          label: "균형 있게",
          editorRole: "실전적인 웹소설 편집자",
          toneInstruction: "t".repeat(501),
          suggestionInstruction: "수정안을 구체적으로 쓴다.",
        },
      }),
    }),
    makeEnv({ ENABLE_OWNER_BYPASS: "true" })
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("turnstileToken over limit returns PAYLOAD_TOO_LARGE", async () => {
  const response = await worker.fetch(
    makeWorkerRequest({
      body: makeValidPayload({
        turnstileToken: "t".repeat(4097),
      }),
    }),
    makeEnv()
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("boundary-sized non-manuscript fields pass size validation", async () => {
  const checks = Array.from({ length: 12 }, (_, index) =>
    makeStructuredCheck({
      id: `s1_lock_lead__check_${index}`,
      label: `체크 ${index}`,
      question: index === 0 ? "q".repeat(400) : "q",
      lookFor: index === 0 ? Array.from({ length: 8 }, () => "l") : ["ok"],
      scoreGuide:
        index === 0
          ? {
              high: "h".repeat(240),
              mid: "m".repeat(240),
              low: "l".repeat(240),
            }
          : {
              high: "h",
              mid: "m",
              low: "l",
            },
    })
  );

  const response = await worker.fetch(
    makeWorkerRequest({
      ownerKey: "test-owner-key",
      body: makeValidPayload({
        checks,
        turnstileToken: "t".repeat(4096),
        meta: {
          lang: "ko",
          version: "v".repeat(16),
          nodeId: "n",
          nodeTitle: "t",
          nodeKind: "k",
          nodeLane: "l",
          curriculumStage: "c",
          genre: "g",
          draftStage: "d",
          narrativePOV: "p",
          authorGoal: "a".repeat(500),
          mustKeep: ["m".repeat(120), ...Array.from({ length: 19 }, () => "m")],
        },
        preset: {
          id: "i".repeat(32),
          label: "l".repeat(64),
          editorRole: "editor",
          toneInstruction: "t".repeat(500),
          suggestionInstruction: "s".repeat(500),
        },
      }),
    }),
    makeEnv({
      ENABLE_OWNER_BYPASS: "true",
      OPENAI_API_KEY: "",
    })
  );
  const payload = await response.json();

  assert.notEqual(response.status, 413);
  assert.notEqual(payload?.error?.code, "PAYLOAD_TOO_LARGE");
});

test("RateLimiterDO alarm deletes expired keys and keeps non-expired keys", async (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  const state = makeDoState([
    ["rate:novel:expired", { count: 1, expiresAt: 1_699_999_999_999 }],
    ["rate:novel:active", { count: 2, expiresAt: 1_700_000_100_000 }],
  ]);
  const limiter = new RateLimiterDO(state);

  await limiter.alarm();

  assert.equal(await state.storage.get("rate:novel:expired"), undefined);
  assert.deepEqual(await state.storage.get("rate:novel:active"), { count: 2, expiresAt: 1_700_000_100_000 });
  assert.equal(await state.storage.get("gc:cursor"), undefined);
  assert.ok(Number(await state.storage.getAlarm()) > 1_700_000_000_000);
});

test("RateLimiterDO alarm stores gc cursor when more than one batch remains", async (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  const entries = [];
  for (let i = 0; i < 120; i += 1) {
    const id = String(i).padStart(3, "0");
    entries.push([`rate:novel:${id}`, { count: 1, expiresAt: 1_699_999_999_999 }]);
  }
  const state = makeDoState(entries);
  const limiter = new RateLimiterDO(state);

  await limiter.alarm();

  const cursor = await state.storage.get("gc:cursor");
  assert.equal(typeof cursor, "string");
  assert.ok(cursor.startsWith("rate:"));
  const remaining = [...state.storage.data.keys()].filter((key) => key.startsWith("rate:")).length;
  assert.ok(remaining > 0);
  assert.ok(Number(await state.storage.getAlarm()) > 1_700_000_000_000);
});

test("RateLimiterDO fetch schedules gc alarm when missing", async (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  const state = makeDoState();
  const limiter = new RateLimiterDO(state);

  const response = await limiter.fetch(
    new Request("https://rate-limiter.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "novel:2026-04-11:203.0.113.5",
        limit: 3,
        ttlSec: 100,
      }),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.allowed, true);
  assert.ok(Number(await state.storage.getAlarm()) > 1_700_000_000_000);
});
