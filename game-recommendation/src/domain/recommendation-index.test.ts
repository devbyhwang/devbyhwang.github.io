import { describe, expect, it } from "vitest";
import { ALL_QUERIES, recommendationKey } from "./recommendation-index";

describe("recommendation index", () => {
  it("covers every UI query combination with unique stable keys", () => {
    expect(ALL_QUERIES).toHaveLength(3 * 5 * 2 * 6);
    expect(new Set(ALL_QUERIES.map(recommendationKey)).size).toBe(ALL_QUERIES.length);
    expect(recommendationKey({ length: "medium", players: 1, viewerParticipation: false, vibe: "healing" }))
      .toBe("medium|1|0|healing");
  });
});
