import test from "node:test";
import assert from "node:assert/strict";

import worker, {
  buildPrompt,
  normalizeModelPayload,
  normalizeRequestPayload,
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
} = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (origin) headers.set("Origin", origin);
  if (ip) headers.set("CF-Connecting-IP", ip);
  if (ownerKey) headers.set("X-Owner-Key", ownerKey);

  return new Request("https://novel-proxy.devbyhwang.workers.dev/v1/novel-feedback", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : null,
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
