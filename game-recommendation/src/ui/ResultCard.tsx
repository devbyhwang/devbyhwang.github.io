import { SESSION_TEXT, type Pick, type Relaxation, type SlotKind, type WhyPart } from "../domain/types";

export const RELAXATION_LABELS: Record<Relaxation, string> = {
  vibeThreshold: "분위기 조건",
  sessionShape: "방송 길이 조건",
  viewerPlayable: "시청자 참여 조건",
};

const SLOT_BADGE: Record<Exclude<SlotKind, "safe">, string> = {
  rising: "지금 뜨는 중",
  discovery: "발견",
  new: "신작",
};

type Props = {
  pick: Pick;
  /** 안전한 선택 슬롯의 순위(1부터). 다른 슬롯이면 null */
  rank: number | null;
};

/** 이전 recommendations.json은 시청자 수 문장을 저장한다. 파싱은 유지하되 화면에는 중립 문구만 보인다. */
function displayWhyText(why: WhyPart): string {
  if (/^채널당 시청자\s+[\d,]+명$/.test(why.text)) return "방송 참여가 활발함";
  if (/^현재\s+[\d,]+명 시청 중$/.test(why.text)) return "지금 관심이 높은 게임";
  return why.text;
}

export function ResultCard({ pick, rank }: Props) {
  const { game } = pick;
  const title = game.nameKo ?? game.name;
  const unknownPlayers = game.players.max === "unknown";
  const badgeText = pick.slot === "safe" ? String(rank ?? "") : SLOT_BADGE[pick.slot];
  const badgeClass = pick.slot === "safe" ? "badge-slot" : `badge-slot ${pick.slot}`;

  return (
    <article className="card">
      <div className="poster">
        {game.coverUrl ? (
          <img src={game.coverUrl} alt="" loading="lazy" />
        ) : (
          <div className="poster-fallback">{title}</div>
        )}
        <span className={badgeClass}>{badgeText}</span>
      </div>

      <h2 className="card-title">
        {game.storeUrl ? (
          <a href={game.storeUrl} target="_blank" rel="noreferrer">
            {title}
          </a>
        ) : (
          title
        )}
      </h2>

      <p className="card-why">{pick.why.map(displayWhyText).join(" · ")}</p>

      <ul className="card-meta">
        <li className="session">{SESSION_TEXT[game.sessionShape]}</li>
        {unknownPlayers ? (
          <li className="players-unknown">인원 정보 없음</li>
        ) : (
          <li className="players-known">최대 {game.players.max}인</li>
        )}
        {game.discountPercent !== undefined && game.discountPercent > 0 && <li>-{game.discountPercent}% 할인 중</li>}
      </ul>
    </article>
  );
}
