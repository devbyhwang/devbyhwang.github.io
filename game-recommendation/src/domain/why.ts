import { MIN_OPPORTUNITY_PCT_FOR_REASON, MS_PER_DAY, PCT_SCALE } from "./constants";
import { SESSION_TEXT } from "./types";
import type { Game, Query, Scored, ScoreTerm, SlotKind, WhyKind, WhyPart } from "./types";

export function daysSinceRelease(iso: string, asOf = new Date().toISOString()): number {
  return Math.round((Date.parse(asOf) - Date.parse(iso)) / MS_PER_DAY);
}

function scoreTermText(kind: WhyKind, raw: number, game: Game): string | null {
  switch (kind) {
    case "opportunity":
      // 하위권 백분위를 "상위 N%"로 포장하면 나쁜 순위가 장점처럼 보인다 — 하한 미만이면 문장을 만들지 않는다
      if (raw < MIN_OPPORTUNITY_PCT_FOR_REASON) return null;
      return `채널당 시청자 상위 ${Math.max(1, Math.round((1 - raw) * PCT_SCALE))}%`;
    case "topOnTwitch":
      return `현재 ${game.buzz.twitchViewers.toLocaleString("ko-KR")}명 시청 중`;
    default:
      return null;
  }
}

/** 기여도 내림차순으로 훑으며, 이미 사용된 항을 건너뛰고 문장으로 렌더 가능한 첫 양수 항을 고른다. */
function pickScoreTermText(
  terms: ScoreTerm[],
  used: Set<WhyKind>,
  game: Game,
): WhyPart | null {
  const candidates = terms
    .filter((t) => t.contribution > 0 && !used.has(t.kind))
    .sort((a, b) => b.contribution - a.contribution);
  for (const t of candidates) {
    const text = scoreTermText(t.kind, t.raw, game);
    if (text) return { kind: t.kind, text };
  }
  return null;
}

function growthText(game: Game): string | null {
  const g = game.buzz.viewerGrowth7d;
  if (g === null) return null;
  return `이번 주 시청자 ${g.toFixed(1)}배 증가`;
}

function newReleaseText(game: Game, asOf?: string): string {
  const days = daysSinceRelease(game.releaseDate, asOf);
  const rating = game.rating !== undefined
    ? ` · 평점 ${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(game.rating)}`
    : "";
  const release = days < 0 ? `${Math.abs(days)}일 후 출시 예정` : `${days}일 전 출시`;
  return `${release}${rating}`;
}

function playerFitText(game: Game, query: Query): string | null {
  if (query.players <= 1) return null;
  if (game.players.max === "unknown") return null;
  const mode = game.players.online ? "온라인" : game.players.localCoop ? "로컬" : "";
  return `${game.players.max}인 ${mode} 협동 지원`.replace("  ", " ");
}

export function buildWhy(scored: Scored, slot: SlotKind, query: Query, asOf?: string): WhyPart[] {
  const { game, terms } = scored;
  const parts: WhyPart[] = [];

  // 슬롯이 첫 문장을 강제한다 — 그 슬롯에 올린 이유가 곧 근거이기 때문이다
  if (slot === "rising") {
    const text = growthText(game);
    if (text) parts.push({ kind: "growth", text });
  } else if (slot === "new") {
    parts.push({ kind: "newRelease", text: newReleaseText(game, asOf) });
  }

  if (parts.length === 0) {
    const picked = pickScoreTermText(terms, new Set(), game);
    if (picked) parts.push(picked);
  }

  // 두 번째 문장 — 인원 정보를 우선하고, 없으면 남은 점수 항, 그것도 없으면 세션 형태
  const player = playerFitText(game, query);
  if (player) {
    parts.push({ kind: "playerFit", text: player });
  } else {
    const used = new Set(parts.map((p) => p.kind));
    const picked = pickScoreTermText(terms, used, game);
    if (picked) parts.push(picked);
    else parts.push({ kind: "sessionFit", text: SESSION_TEXT[game.sessionShape] });
  }

  return parts.slice(0, 2);
}
