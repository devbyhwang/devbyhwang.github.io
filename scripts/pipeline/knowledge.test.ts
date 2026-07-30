import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadKnowledge } from "./knowledge";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function knowledgeCopy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "catalog-knowledge-"));
  roots.push(root);
  const destination = join(root, "data", "knowledge");
  await mkdir(destination, { recursive: true });
  await cp("data/knowledge", destination, { recursive: true });
  return root;
}

async function changeAsset(
  root: string,
  asset: string,
  change: (value: Record<string, unknown>) => void,
): Promise<void> {
  const path = join(root, "data", "knowledge", asset);
  const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  change(value);
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("loadKnowledge", () => {
  it("loads the repository's editable knowledge assets", async () => {
    const root = await knowledgeCopy();

    expect(loadKnowledge(root)).toMatchObject({
      vibeWeights: {
        genres: expect.any(Object),
        themes: expect.any(Object),
        tags: { Cozy: { healing: expect.any(Number) } },
      },
      sessionRules: { default: "openended" },
      viewerPlayable: { games: expect.any(Object), tags: expect.any(Object) },
      chzzkAliases: [],
    });
  });

  it("rejects a tag vibe key outside the pipeline contract", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.tags as Record<string, Record<string, number>>).Cozy).relaxing = 1;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*relaxing/);
  });

  it("rejects a negative vibe weight", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.themes as Record<string, Record<string, number>>).Horror).healing = -1;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*Horror\.healing/);
  });

  it("rejects a vibe weight above one", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.genres as Record<string, Record<string, number>>).Puzzle).healing = 1.5;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*Puzzle\.healing/);
  });

  it("rejects an invalid session shape", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "session-shape.json", (value) => {
      ((value.rules as Record<string, unknown>[])[0]).shape = "episode";
    });

    expect(() => loadKnowledge(root)).toThrow(/session-shape\.json.*shape/);
  });

  it("rejects viewer-playable entries without a reason", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "viewer-playable.json", (value) => {
      delete ((value.games as Record<string, Record<string, unknown>>)["119171"]).reason;
    });

    expect(() => loadKnowledge(root)).toThrow(/viewer-playable\.json.*reason/);
  });

  it("rejects Chzzk aliases with invalid IGDB ids or empty values", async () => {
    const root = await knowledgeCopy();
    const path = join(root, "data", "knowledge", "chzzk-game-aliases.json");
    await writeFile(path, JSON.stringify([{ igdbId: "0", names: [""] }]), "utf8");

    expect(() => loadKnowledge(root)).toThrow(/chzzk-game-aliases\.json.*igdbId/);
  });
});
