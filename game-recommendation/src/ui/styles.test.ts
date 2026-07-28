import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("game-recommendation/src/ui/styles.css", "utf8");

function mountStylesheet(): CSSStyleSheet {
  const element = document.createElement("style");
  element.dataset.testStyles = "true";
  element.textContent = styles;
  document.head.append(element);
  return element.sheet!;
}

function mobileRules(sheet: CSSStyleSheet): CSSRuleList {
  const media = Array.from(sheet.cssRules).find(
    (rule): rule is CSSMediaRule =>
      rule instanceof CSSMediaRule && rule.conditionText === "(max-width: 599px)",
  );
  if (!media) throw new Error("max-width: 599px 미디어 규칙을 찾을 수 없습니다");
  return media.cssRules;
}

afterEach(() => {
  document.querySelectorAll("style[data-test-styles]").forEach((element) => element.remove());
});

describe("모바일 스타일", () => {
  it("알려진 인원과 미상 인원 메타를 숨기고 세션 길이는 남긴다", () => {
    const hiddenSelectors = Array.from(mobileRules(mountStylesheet()))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .filter((rule) => rule.style.display === "none")
      .flatMap((rule) => rule.selectorText.split(",").map((selector) => selector.trim()));

    expect(hiddenSelectors).toContain(".card-meta .players-known");
    expect(hiddenSelectors).toContain(".card-meta .players-unknown");
    expect(hiddenSelectors).not.toContain(".card-meta .session");
  });

  it("입력 그룹 간격을 26px로 줄인다", () => {
    const root = Array.from(mobileRules(mountStylesheet())).find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText === ":root",
    );

    expect(root?.style.getPropertyValue("--gap-group")).toBe("26px");
  });
});
