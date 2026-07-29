import { useState } from "react";
import { QueryPanel } from "./QueryPanel";
import { RELAXATION_LABELS, ResultCard } from "./ResultCard";
import { DebugPanel } from "./DebugPanel";
import { ExplorationPanel } from "./ExplorationPanel";
import { recommendationKey, type RecommendationIndex } from "../domain/recommendation-index";
import {
  LENGTH_LABELS,
  PLAYER_LABELS,
  VIBE_LABELS,
  type BlockedBy,
  type Query,
} from "../domain/types";
import "./styles.css";

const INITIAL: Query = {
  length: "medium",
  players: 1,
  viewerParticipation: false,
  vibe: "healing",
};

const EMPTY_HINT: Record<BlockedBy, { reason: string; suggest: string }> = {
  players: {
    reason: "요청하신 인원으로 함께 할 수 있는 게임이 없습니다.",
    suggest: "인원을 줄여보세요",
  },
  vibe: {
    reason: "분위기 기준을 낮춰봐도 해당하는 게임이 없습니다.",
    suggest: "분위기를 바꿔보세요",
  },
  other: {
    reason: "조건에 맞는 게임은 있지만 현재 추천 기준으로 고를 수 없습니다.",
    suggest: "조건을 조금 넓혀보세요",
  },
};

function summarize(q: Query): string {
  const parts = [LENGTH_LABELS[q.length], PLAYER_LABELS[q.players], VIBE_LABELS[q.vibe]];
  if (q.viewerParticipation) parts.push("시청자 참여");
  return parts.join(" · ");
}

type Props = {
  index: RecommendationIndex;
};

function formatCatalogDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleString("ko-KR");
}

export function App({ index }: Props) {
  const [query, setQuery] = useState<Query>(INITIAL);
  const result = index.recommendations[recommendationKey(query)];
  if (!result) throw new Error(`missing recommendation for query: ${recommendationKey(query)}`);
  const debug = new URLSearchParams(window.location.search).has("debug");

  const relaxed = result.relaxations.map((r) => RELAXATION_LABELS[r]).join(", ");
  const empty = result.picks.length === 0;

  // 안전한 선택 슬롯에만 1부터 순위를 매긴다
  const ranks = new Map<string, number>();
  let n = 0;
  for (const p of result.picks) {
    if (p.slot === "safe") ranks.set(p.game.id, ++n);
  }

  return (
    <main className="app">
      <header className="head">
        <p className="head-kicker">그래서 이제 뭐함?</p>
        <h1 className="head-summary">{summarize(query)}</h1>
      </header>

      <QueryPanel value={query} onChange={setQuery} />

      {relaxed && !empty && (
        <p className="notice">딱 맞는 게임이 적어서 {relaxed}을(를) 완화했습니다</p>
      )}

      {empty ? (
        <div className="empty">
          <p className="empty-title">조건에 맞는 게임이 없습니다</p>
          <p className="empty-body">
            {EMPTY_HINT[result.blockedBy ?? "players"].reason}
            <br />
            <b>{EMPTY_HINT[result.blockedBy ?? "players"].suggest}</b>.
          </p>
        </div>
      ) : (
        <div className="cards">
          {result.picks.map((p) => (
            <div key={p.game.id} className="card-slot">
              <ResultCard pick={p} rank={ranks.get(p.game.id) ?? null} />
              {debug && <DebugPanel pick={p} />}
            </div>
          ))}
        </div>
      )}

      <ExplorationPanel query={query} generatedAt={index.generatedAt} />

      <footer className="foot">
        카탈로그 생성 시각 {formatCatalogDate(index.generatedAt)} · 후보 {result.candidateCount}개
      </footer>
    </main>
  );
}
