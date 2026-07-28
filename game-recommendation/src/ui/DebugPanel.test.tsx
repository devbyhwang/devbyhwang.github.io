import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DebugPanel } from "./DebugPanel";
import { SAMPLE_DATASET } from "../domain/fixtures";
import type { Pick } from "../domain/types";

const pick: Pick = {
  slot: "safe",
  game: SAMPLE_DATASET.games[0],
  score: 0.82,
  why: [{ kind: "opportunity", text: "채널당 시청자 상위 3%" }],
  terms: [
    { kind: "opportunity", raw: 0.97, contribution: 0.582 },
    { kind: "topOnTwitch", raw: 0.6, contribution: 0.24 },
    { kind: "playerFit", raw: 0, contribution: -0.15 },
  ],
};

describe("DebugPanel", () => {
  it("모든 항의 기여도를 보여준다", () => {
    render(<DebugPanel pick={pick} />);
    expect(screen.getByText(/opportunity/)).toBeDefined();
    expect(screen.getByText(/topOnTwitch/)).toBeDefined();
    expect(screen.getByText(/playerFit/)).toBeDefined();
  });

  it("음수 기여도를 부호와 함께 보여준다", () => {
    render(<DebugPanel pick={pick} />);
    expect(screen.getByText(/-0\.150/)).toBeDefined();
  });

  it("최종 점수를 보여준다", () => {
    render(<DebugPanel pick={pick} />);
    expect(screen.getByText(/0\.820/)).toBeDefined();
  });

  it("랭킹에 들어가지 않은 신작은 미랭킹으로 표시한다", () => {
    const unranked: Pick = {
      slot: "new",
      game: SAMPLE_DATASET.games[0],
      score: 0,
      why: [{ kind: "newRelease", text: "15일 전 출시" }],
      terms: [{ kind: "newRelease", raw: 79, contribution: 0 }],
    };
    render(<DebugPanel pick={unranked} />);
    expect(screen.getByText("미랭킹")).toBeDefined();
    expect(screen.queryByText("0.000")).toBeNull();
  });

  it("점수가 있는 픽은 숫자를 그대로 보여준다", () => {
    const rankedNew: Pick = {
      ...pick,
      slot: "new",
      terms: [{ kind: "newRelease", raw: 0.9, contribution: 0.1 }],
    };
    render(<DebugPanel pick={rankedNew} />);
    expect(screen.getByText(/0\.820/)).toBeDefined();
    expect(screen.queryByText("미랭킹")).toBeNull();
  });
});
