import type { Pick } from "../domain/types";

function isUnranked(pick: Pick): boolean {
  return pick.slot === "new" && pick.terms.every((t) => t.contribution === 0);
}

export function DebugPanel({ pick }: { pick: Pick }) {
  return (
    <table className="debug">
      <tbody>
        {pick.terms.map((t) => (
          <tr key={t.kind}>
            <td>{t.kind}</td>
            <td>raw {t.raw.toFixed(3)}</td>
            <td>{t.contribution >= 0 ? "+" : ""}{t.contribution.toFixed(3)}</td>
          </tr>
        ))}
        <tr className="debug-total">
          <td>score</td>
          <td />
          <td>{isUnranked(pick) ? "미랭킹" : pick.score.toFixed(3)}</td>
        </tr>
      </tbody>
    </table>
  );
}
