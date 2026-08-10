import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const destination = "https://mohaji-ci1.pages.dev/";
const legacyPath = "/playground/game-recommendation/";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cardAnchor(output: string, ariaLabel: string): string {
  const pattern = new RegExp(
    `<a\\b(?=[^>]*aria-label="${escapeRegExp(ariaLabel)}")[^>]*>[\\s\\S]*?</a>`,
  );
  const match = output.match(pattern);
  expect(match, `missing card anchor: ${ariaLabel}`).not.toBeNull();
  return match![0];
}

describe("retired game recommendation route", () => {
  it("builds a progressive redirect to the exact Mohaji root", () => {
    const output = readFileSync(
      resolve("_site/playground/game-recommendation/index.html"),
      "utf8",
    );

    expect(output).toContain(
      '<meta http-equiv="refresh" content="0; url=https://mohaji-ci1.pages.dev/">',
    );
    expect(output).toContain(`location.replace(${JSON.stringify(destination)})`);
    expect(output).toContain(`<link rel="canonical" href="${destination}">`);
    expect(output).toContain(`<a href="${destination}">Mohaji에서 열기</a>`);
    expect(output).not.toContain("location.search");
    expect(output).not.toContain("location.hash");
  });

  it("links only the Mohaji card externally in a new tab", () => {
    const output = readFileSync(resolve("_site/playground/index.html"), "utf8");
    const mohaji = cardAnchor(
      output,
      "오늘 뭐 켜지? · Mohaji 추천 시작 새 탭에서 열기",
    );
    const embercraft = cardAnchor(output, "Embercraft Fireplace Launch");

    expect(mohaji).toContain(`href="${destination}"`);
    expect(mohaji).toContain('target="_blank"');
    expect(mohaji).toContain('rel="noopener"');
    expect(mohaji).toContain("↗");
    expect(embercraft).toContain('href="/playground/embercraft/"');
    expect(embercraft).not.toContain('target="_blank"');
    expect(embercraft).not.toContain('rel="noopener"');
    expect(embercraft).not.toContain("↗");
    expect(output).not.toContain(`href="${legacyPath}"`);
  });
});
