import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrompt,
  normalizeModelPayload,
  normalizeRequestPayload,
} from "./index.js";

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
