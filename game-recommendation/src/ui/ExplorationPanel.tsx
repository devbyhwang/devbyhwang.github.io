import { useEffect, useState } from "react";
import { PAGE_SIZE, type ExplorationCard, type ExplorationView } from "../domain/exploration";
import type { Query } from "../domain/types";
import { SESSION_TEXT } from "../domain/types";
import { loadExplorationPage } from "../data/exploration";

const VIEWS: { id: ExplorationView; label: string }[] = [
  { id: "all", label: "전체 추천" },
  { id: "new", label: "신작" },
  { id: "rising", label: "지금 뜨는" },
  { id: "discovery", label: "숨은 게임" },
  { id: "classic", label: "클래식" },
];

type Props = { query: Query; generatedAt: string };

function ExplorationCardView({ card, rank }: { card: ExplorationCard; rank: number }) {
  const title = card.nameKo ?? card.name;
  return (
    <article className="card">
      <div className="poster">
        {card.coverUrl ? <img src={card.coverUrl} alt="" loading="lazy" /> : <div className="poster-fallback">{title}</div>}
        <span className="badge-slot">{rank}</span>
      </div>
      <h2 className="card-title">{card.storeUrl ? <a href={card.storeUrl} target="_blank" rel="noreferrer">{title}</a> : title}</h2>
      <ul className="card-meta">
        <li><b>{card.twitchViewers.toLocaleString("ko-KR")}</b>명 시청 중</li>
        <li className="session">{SESSION_TEXT[card.sessionShape]}</li>
        {card.players.max === "unknown" ? <li className="players-unknown">인원 정보 없음</li> : <li className="players-known">최대 {card.players.max}인</li>}
        {card.discountPercent !== undefined && card.discountPercent > 0 && <li>-{card.discountPercent}% 할인 중</li>}
      </ul>
    </article>
  );
}

function ExplorationContents({ query, generatedAt }: Props) {
  const [view, setView] = useState<ExplorationView>("all");
  const [cards, setCards] = useState<ExplorationCard[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    loadExplorationPage(query, view, page).then((result) => {
      if (!current) return;
      if (result.manifest.generatedAt !== generatedAt) throw new Error("exploration catalog timestamp mismatch");
      setCards(result.cards);
      setHasMore(result.hasMore);
      setTotal(view === "all" ? result.manifest.rank.ordinalCount : result.manifest.views[view].count);
    }).catch(() => {
      if (current) setError(true);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [query.length, query.players, query.viewerParticipation, query.vibe, view, page, generatedAt, retry]);

  const selectView = (next: ExplorationView) => {
    if (next === view) return;
    setView(next);
    setPage(0);
    setCards([]);
    setTotal(null);
    setHasMore(false);
  };

  return (
    <div className="exploration">
      <div className="exploration-head">
        {total !== null && <p>{total.toLocaleString("ko-KR")}개 결과</p>}
      </div>
      <div className="exploration-tabs" role="tablist" aria-label="탐색 방식">
        {VIEWS.map(({ id, label }) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => selectView(id)}>{label}</button>)}
      </div>
      {error ? (
        <div className="exploration-state"><p>게임 목록을 불러오지 못했습니다.</p><button type="button" onClick={() => setRetry((count) => count + 1)}>재시도</button></div>
      ) : (
        <>
          {cards.length > 0 && <div className="cards exploration-cards">{cards.map((card, index) => <ExplorationCardView key={card.id} card={card} rank={page * PAGE_SIZE + index + 1} />)}</div>}
          {!loading && cards.length === 0 && <p className="exploration-state">이 분류에는 조건에 맞는 게임이 없습니다.</p>}
          {loading && <p className="exploration-state">게임 목록을 불러오는 중입니다…</p>}
          {!loading && cards.length > 0 && (page > 0 || hasMore) && (
            <nav className="exploration-more" aria-label="게임 목록 페이지">
              {page > 0 && <button type="button" onClick={() => setPage((value) => value - 1)}>이전 페이지</button>}
              <span aria-live="polite">{page + 1}페이지</span>
              {hasMore && <button type="button" onClick={() => setPage((value) => value + 1)}>다음 페이지</button>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export function ExplorationPanel(props: Props) {
  const { query, generatedAt } = props;
  const key = `${query.length}|${query.players}|${Number(query.viewerParticipation)}|${query.vibe}|${generatedAt}`;
  return <ExplorationContents key={key} {...props} />;
}
