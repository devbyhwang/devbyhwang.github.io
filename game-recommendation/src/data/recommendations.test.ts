import { describe, expect, it, vi } from "vitest";
import { ALL_QUERIES, recommendationKey, type RecommendationIndex } from "../domain/recommendation-index";
import { loadRecommendations } from "./recommendations";

function validIndex(): RecommendationIndex {
  return {
    generatedAt: "2026-07-28T00:00:00.000Z",
    gameCount: 0,
    recommendations: Object.fromEntries(ALL_QUERIES.map((query) => [recommendationKey(query), {
      picks: [],
      relaxations: [],
      candidateCount: 0,
      blockedBy: "other",
    }])),
  };
}

describe("loadRecommendations", () => {
  it("requests only recommendations.json", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(validIndex()), { status: 200 }));

    await expect(loadRecommendations(fetcher)).resolves.toEqual(validIndex());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("./recommendations.json");
  });

  it("reports missing query entries with recommendations.json context", async () => {
    const index = validIndex();
    delete index.recommendations["long|5|1|spectacle"];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(index), { status: 200 }));

    await expect(loadRecommendations(fetcher)).rejects.toThrow(
      "recommendations.json: missing recommendation: long|5|1|spectacle",
    );
  });
});
