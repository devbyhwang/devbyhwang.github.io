import type { ReactNode } from "react";
import type { LengthBucket, Query, VibeKey } from "../domain/types";
import { LENGTH_LABELS, PLAYER_LABELS, VIBE_KEYS, VIBE_LABELS } from "../domain/types";

const LENGTHS: LengthBucket[] = ["short", "medium", "long"];
const PLAYERS: number[] = [1, 2, 3, 4, 5];

const PARTICIPATION: { value: boolean; label: string; aria: string }[] = [
  { value: false, label: "없음", aria: "시청자 참여 없음" },
  { value: true, label: "필요", aria: "시청자 참여 필요" },
];

type Props = { value: Query; onChange: (q: Query) => void };

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="qgroup">
      <span className="qgroup-label">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Opt({
  label, ariaLabel, selected, onSelect,
}: { label: string; ariaLabel?: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="opt"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

export function QueryPanel({ value, onChange }: Props) {
  return (
    <section className="query">
      <Group label="길이">
        {LENGTHS.map((k) => (
          <Opt
            key={k}
            label={LENGTH_LABELS[k]}
            selected={value.length === k}
            onSelect={() => onChange({ ...value, length: k })}
          />
        ))}
      </Group>

      <Group label="인원">
        {PLAYERS.map((n) => (
          <Opt
            key={n}
            label={PLAYER_LABELS[n]}
            selected={value.players === n}
            onSelect={() => onChange({ ...value, players: n })}
          />
        ))}
      </Group>

      <Group label="시청자 참여">
        {PARTICIPATION.map((p) => (
          <Opt
            key={String(p.value)}
            label={p.label}
            ariaLabel={p.aria}
            selected={value.viewerParticipation === p.value}
            onSelect={() => onChange({ ...value, viewerParticipation: p.value })}
          />
        ))}
      </Group>

      <Group label="분위기">
        {VIBE_KEYS.map((k: VibeKey) => (
          <Opt
            key={k}
            label={VIBE_LABELS[k]}
            selected={value.vibe === k}
            onSelect={() => onChange({ ...value, vibe: k })}
          />
        ))}
      </Group>
    </section>
  );
}
