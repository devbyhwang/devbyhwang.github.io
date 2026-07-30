import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultCard } from "./ResultCard";
import { SAMPLE_CATALOG } from "../domain/fixtures";
import type { Game, Pick } from "../domain/types";
import { readFileSync } from "node:fs";

const game = (id: string): Game => SAMPLE_CATALOG.find((g) => g.id === id)!;
const styles = readFileSync("game-recommendation/src/ui/styles.css", "utf8");

function styleValueFor(selector: string, property: string): string {
  const element = document.createElement("style");
  element.textContent = styles;
  document.head.append(element);

  const value = Array.from(element.sheet!.cssRules).reduce((current, candidate) => {
    const rule = candidate as CSSStyleRule;
    if (
      rule.selectorText &&
      rule.selectorText.split(",").map((part) => part.trim()).includes(selector)
    ) {
      return rule.style.getPropertyValue(property) || current;
    }
    return current;
  }, "");

  element.remove();
  if (!value) throw new Error(`${selector}의 ${property} CSS 선언을 찾을 수 없습니다`);
  return value;
}

const base: Pick = {
  slot: "safe",
  game: game("g5"),
  score: 0.82,
  why: [
    { kind: "opportunity", text: "채널당 시청자 상위 3%" },
    { kind: "playerFit", text: "4인 온라인 협동 지원" },
  ],
  terms: [{ kind: "opportunity", raw: 0.97, contribution: 0.58 }],
};

describe("ResultCard", () => {
  it("게임명과 근거 문장을 보여준다", () => {
    render(<ResultCard pick={base} rank={1} />);
    expect(screen.getByText("Lethal Company")).toBeDefined();
    expect(screen.getByText(/채널당 시청자 상위 3%/)).toBeDefined();
    expect(screen.getByText(/4인 온라인 협동 지원/)).toBeDefined();
  });

  it("안전한 선택 슬롯은 순위 숫자를 배지로 단다", () => {
    render(<ResultCard pick={base} rank={2} />);
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.queryByText("안전한 선택")).toBeNull();
  });

  it("나머지 슬롯은 라벨을 배지로 단다", () => {
    render(<ResultCard pick={{ ...base, slot: "rising" }} rank={null} />);
    expect(screen.getByText("지금 뜨는 중")).toBeDefined();
    render(<ResultCard pick={{ ...base, slot: "new" }} rank={null} />);
    expect(screen.getByText("신작")).toBeDefined();
  });

  it("discovery 픽은 발견 배지와 설명을 렌더한다", () => {
    render(<ResultCard pick={{ ...base, slot: "discovery", why: [{ kind: "discovery", text: "잘 알려지지 않았지만 평이 좋은 게임 발견" }] }} rank={null} />);

    expect(screen.getByText("발견")).toBeDefined();
    expect(screen.getByText(/잘 알려지지 않았지만/)).toBeDefined();
  });

  it("커버가 있으면 이미지를 렌더한다", () => {
    // alt=""인 장식 이미지는 img role로 노출되지 않으므로 DOM에서 직접 찾는다
    const { container } = render(<ResultCard pick={base} rank={1} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("library_600x900.jpg");
  });

  it("커버가 없으면 이름을 크게 쓴 대체판을 렌더한다", () => {
    const noCover = { ...base, game: { ...base.game, coverUrl: undefined } };
    const { container } = render(<ResultCard pick={noCover} rank={1} />);
    expect(container.querySelector("img")).toBeNull();
    // 제목과 대체판 두 곳에 이름이 나온다
    expect(screen.getAllByText("Lethal Company").length).toBe(2);
  });

  it("플랫폼 시청자 수를 노출하지 않는다", () => {
    const { container } = render(<ResultCard pick={base} rank={1} />);
    expect(container.textContent).not.toMatch(/\d[\d,]*명 시청 중/);
  });

  it("세션 형태에 맞는 방송 길이 안내를 보여준다", () => {
    render(<ResultCard pick={base} rank={1} />);
    expect(screen.getByText("한 판 20~60분")).toBeDefined();
  });

  it("할인 중이면 할인율과 안내를 보여준다", () => {
    const onSale = { ...base, game: { ...base.game, discountPercent: 40 } };
    render(<ResultCard pick={onSale} rank={1} />);
    expect(screen.getByText("-40% 할인 중")).toBeDefined();
  });

  it("할인율이 0이면 할인 안내를 보여주지 않는다", () => {
    const fullPrice = { ...base, game: { ...base.game, discountPercent: 0 } };
    render(<ResultCard pick={fullPrice} rank={1} />);
    expect(screen.queryByText(/할인 중/)).toBeNull();
  });

  it("인원 정보가 없으면 배지를 보여준다", () => {
    render(<ResultCard pick={{ ...base, game: game("g26") }} rank={1} />);
    expect(screen.getByText("인원 정보 없음")).toBeDefined();
    expect(screen.queryByText(/최대 \d+인/)).toBeNull();
  });

  it("알려진 인원 수를 최대 N인으로 보여준다", () => {
    render(<ResultCard pick={base} rank={1} />);
    expect(screen.getByText("최대 4인")).toBeDefined();
    expect(screen.queryByText("인원 정보 없음")).toBeNull();
  });

  it("상점 링크가 있으면 게임명을 링크로 감싼다", () => {
    render(<ResultCard pick={base} rank={1} />);
    const link = screen.getByRole("link", { name: /Lethal Company/ });
    expect(link.getAttribute("href")).toContain("store.steampowered.com");
  });

  it("포스터 대체판은 padding과 border를 3:4 외곽 크기 안에 포함한다", () => {
    expect(styleValueFor(".poster-fallback", "box-sizing")).toBe("border-box");
  });

  it("제목 링크는 방문 여부와 관계없이 테마 제목 색을 쓴다", () => {
    expect(styleValueFor(".card-title a", "color")).toBe("var(--fg)");
    expect(styleValueFor(".card-title a:visited", "color")).toBe("var(--fg)");
  });
});
