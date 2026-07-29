import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "./index";

const indexHtml = readFileSync("game-recommendation/index.html", "utf8");

function workflow(path: string): string {
  return readFileSync(path, "utf8");
}

describe("catalog refresh deployment handoff", () => {
  it("deploys through the blog's existing main push workflow", () => {
    const deploy = workflow(".github/workflows/deploy.yml");
    expect(deploy).toContain("push:");
    expect(deploy).toContain("branches: [main]");
    expect(deploy).toContain("workflow_run:");
    expect(deploy).toContain("- Refresh game recommendation catalog");
    expect(deploy).toContain("- Backfill game recommendation catalog");
    expect(deploy).toContain("    branches: [main]");
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deploy).toContain("github.event.workflow_run.head_branch == 'main'");
  });

  it("keeps the existing human push and dispatch triggers", () => {
    const deploy = workflow(".github/workflows/deploy.yml");
    expect(deploy).toContain("push:");
    expect(deploy).toContain("workflow_dispatch:");
    expect(deploy).toContain("actions/checkout@v4");
  });

  it("keeps source and deployment permissions narrowly scoped", () => {
    const refresh = workflow(".github/workflows/catalog-refresh.yml");
    const deploy = workflow(".github/workflows/deploy.yml");
    expect(refresh).toMatch(/permissions:\n  contents: write/);
    expect(refresh).not.toMatch(/pages:|id-token:/);
    expect(deploy).toMatch(/permissions:\n  contents: read\n  pages: write\n  id-token: write/);
  });

  it("requires manual backfill boundaries, serializes partitions, and uses secrets-only Twitch credentials", () => {
    const backfill = workflow(".github/workflows/catalog-backfill.yml");

    expect(backfill).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+start:\n(?:\s+.+\n)+?\s+required:\s+true/);
    expect(backfill).toMatch(/workflow_dispatch:\n[\s\S]*\n\s+end:\n(?:\s+.+\n)+?\s+required:\s+true/);
    expect(backfill).toMatch(/concurrency:\n\s+group:\s+game-catalog-backfill\n\s+cancel-in-progress:\s+false/);
    expect(backfill).toContain('node-version: "20"');
    expect(backfill).toContain("npm ci");
    expect(backfill).toContain('npm run pipeline:backfill -- --start "${{ inputs.start }}" --end "${{ inputs.end }}"');
    expect(backfill).toContain("npm run pipeline");
    expect(backfill).toContain("npm run pipeline:validate");
    expect(backfill).toContain("find data/raw -type f -size +95M");
    expect(backfill).toContain("TWITCH_CLIENT_ID: ${{ secrets.TWITCH_CLIENT_ID }}");
    expect(backfill).toContain("TWITCH_CLIENT_SECRET: ${{ secrets.TWITCH_CLIENT_SECRET }}");
    expect(backfill).not.toContain("TWITCH_CLIENT_ID: ${{ vars.");
    expect(backfill).not.toContain("TWITCH_CLIENT_SECRET: ${{ vars.");
  });

  it("keeps the daily refresh schedule, avoids runtime model services, and stages checkpointed catalog outputs", () => {
    const refresh = workflow(".github/workflows/catalog-refresh.yml");

    expect(refresh).toContain('cron: "0 0 * * *"');
    expect(refresh).toContain("npm run pipeline");
    expect(refresh).toContain("npm run pipeline:validate");
    expect(refresh).toContain("find data/raw -type f -size +95M");
    expect(refresh).not.toMatch(/pipeline:model|OPENAI_|ANTHROPIC_|COHERE_|MISTRAL_/);
    expect(refresh).toContain("src/playground/game-recommendation/recommendations.json");
  });

  it("does not fail when a legacy catalog run has no chunk directory yet", () => {
    const refresh = workflow(".github/workflows/catalog-refresh.yml");
    const backfill = workflow(".github/workflows/catalog-backfill.yml");
    const optionalChunkStage = "if [ -d src/playground/game-recommendation/catalog/chunks ]; then\n            git add src/playground/game-recommendation/catalog/chunks\n          fi";

    expect(refresh).toContain(optionalChunkStage);
    expect(backfill).toContain(optionalChunkStage);
  });

  it("stages the recommendation index after a historical backfill", () => {
    const backfill = workflow(".github/workflows/catalog-backfill.yml");

    expect(backfill).toContain("src/playground/game-recommendation/recommendations.json");
  });

  it("stages exploration assets after refreshes and backfills", () => {
    const refresh = workflow(".github/workflows/catalog-refresh.yml");
    const backfill = workflow(".github/workflows/catalog-backfill.yml");

    expect(refresh).toContain("src/playground/game-recommendation/exploration");
    expect(backfill).toContain("src/playground/game-recommendation/exploration");
  });

  it("validates the recommendation index against manifest chunks before uploading the Pages artifact", () => {
    const deploy = workflow(".github/workflows/deploy.yml");

    expect(deploy).toContain("test -f _site/playground/game-recommendation/catalog.json");
    expect(deploy).toContain("test -f _site/playground/game-recommendation/recommendations.json");
    expect(deploy).toContain("const artifactRoot = \"_site/playground/game-recommendation\";");
    expect(deploy).toContain("const gameIds = new Set();");
    expect(deploy).toContain("for (const chunkPath of catalog.chunks)");
    expect(deploy).toContain("const chunkPathOnDisk = resolve(artifactRoot, chunkPath.slice(2));");
    expect(deploy).toContain("accessSync(chunkPathOnDisk);");
    expect(deploy).toContain("index.generatedAt !== catalog.generatedAt");
    expect(deploy).toContain("index.gameCount !== catalogGameCount");
    expect(deploy).toContain("const expectedKeys = new Set(");
    expect(deploy).toContain("expectedKeys.size !== 180");
    expect(deploy).toContain("recommendation picks reference game outside catalog");
    expect(deploy).toContain("const catalogGameCount = Array.isArray(catalog.games) ? catalog.games.length : catalog.gameCount;");
    expect(deploy).toContain("if (Array.isArray(catalog.games)) {");
    expect(deploy).not.toContain("process.exit(0)");
  });

  it("validates compact exploration artifacts and their Pages-safe size before uploading", () => {
    const deploy = workflow(".github/workflows/deploy.yml");

    expect(deploy).toContain("test -f _site/playground/game-recommendation/exploration/manifest.json");
    expect(deploy).toContain("const explorationRoot = `${artifactRoot}/exploration`;");
    expect(deploy).toContain('if (exploration.format !== 1) invalid("manifest format is invalid");');
    expect(deploy).toContain('invalid("manifest generatedAt does not match catalog")');
    expect(deploy).toContain('invalid("manifest gameCount does not match catalog")');
    expect(deploy).toContain("const cardShardCount = 896;");
    expect(deploy).toContain("rank descriptor is inconsistent");
    expect(deploy).toContain("rank vector has an invalid byte length");
    expect(deploy).toContain("rank vector references an invalid ordinal");
    expect(deploy).toContain("readBytes(`${artifactRoot}/${manifest.rank.path}`)");
    expect(deploy).toContain("membership bitset descriptor is inconsistent");
    expect(deploy).toContain("membership bitset has an invalid byte length");
    expect(deploy).toContain("readBytes(`${artifactRoot}/${descriptor.path}`)");
    expect(deploy).toContain("compact cards do not cover the catalog exactly once");
    expect(deploy).toContain("explorationFileCount > 2000");
    expect(deploy).toContain('const siteByteCount = totalBytes("_site");');
    expect(deploy).toContain("siteByteCount >= 1024 * 1024 * 1024");
  });

  it("runs the embedded validator for legacy catalogs instead of bypassing malformed compact assets", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "workflow-legacy-artifact-"));
    const artifactRoot = join(rootDir, "_site/playground/game-recommendation");
    const sourceRoot = resolve("src/playground/game-recommendation");
    const catalog = JSON.parse(readFileSync(join(sourceRoot, "catalog.json"), "utf8"));
    const games = catalog.chunks.flatMap((chunkPath: string) => JSON.parse(readFileSync(join(sourceRoot, chunkPath.slice(2)), "utf8")).games.map((game: { id: string }) => ({ id: game.id })));

    try {
      mkdirSync(join(artifactRoot, "exploration"), { recursive: true });
      writeFileSync(join(artifactRoot, "catalog.json"), JSON.stringify({ generatedAt: catalog.generatedAt, games }));
      symlinkSync(join(sourceRoot, "recommendations.json"), join(artifactRoot, "recommendations.json"));
      symlinkSync(join(sourceRoot, "exploration/cards"), join(artifactRoot, "exploration/cards"));
      symlinkSync(join(sourceRoot, "exploration/queries"), join(artifactRoot, "exploration/queries"));
      const manifest = JSON.parse(readFileSync(join(sourceRoot, "exploration/manifest.json"), "utf8"));
      writeFileSync(join(artifactRoot, "exploration/manifest.json"), JSON.stringify({ ...manifest, gameCount: 0 }));
      const deploy = workflow(".github/workflows/deploy.yml");
      const validator = deploy.slice(deploy.indexOf("          import { accessSync"), deploy.indexOf("          EOF\n", deploy.indexOf("          import { accessSync")))
        .split("\n").map((line) => line.replace(/^          /, "")).join("\n");

      expect(() => execFileSync("node", ["--input-type=module", "--eval", validator], { cwd: rootDir, stdio: "pipe" })).toThrow(/exploration manifest gameCount does not match catalog/);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("pipeline CLI contracts", () => {
  it("rejects an invalid backfill start date before any network work begins", async () => {
    await expect(runCommand("backfill", {
      rootDir: process.cwd(),
      env: { TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
      logger: console,
      fetcher: (() => {
        throw new Error("network should not run");
      }) as typeof fetch,
    }, ["--start", "1990-02-30", "--end", "1991-01-01"])).rejects.toThrow("invalid --start date: 1990-02-30");
  });

  it("rejects an invalid backfill end date before any network work begins", async () => {
    await expect(runCommand("backfill", {
      rootDir: process.cwd(),
      env: { TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
      logger: console,
      fetcher: (() => {
        throw new Error("network should not run");
      }) as typeof fetch,
    }, ["--start", "1990-01-01", "--end", "1991-02-30"])).rejects.toThrow("invalid --end date: 1991-02-30");
  });

  it("captures partition raw responses without persisting credentials", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "workflow-cli-"));
    const fetcher = async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") return new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 });
      if (url === "https://api.igdb.com/v4/games") return new Response(JSON.stringify([{ id: 1, name: "Historical Fixture", first_release_date: 631152000 }]), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    };

    try {
      await runCommand("backfill", {
        rootDir,
        env: { PIPELINE_AS_OF: "2026-07-29T00:00:00.000Z", TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
        logger: console,
        fetcher: fetcher as typeof fetch,
      }, ["--start", "1990-01-01", "--end", "1991-01-01"]);

      const rawPath = join(rootDir, "data/raw/igdb/backfill/1990-01-01_1991-01-01_000000.json");
      expect(existsSync(rawPath)).toBe(true);
      const raw = JSON.parse(readFileSync(rawPath, "utf8"));
      expect(raw.games).toEqual([{ id: 1, name: "Historical Fixture", first_release_date: 631152000 }]);
      expect(raw.responses).toEqual([]);
      expect(readFileSync(rawPath, "utf8")).not.toContain("top-secret");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("stores multi-year backfill responses in one raw file per partition", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "workflow-cli-partitions-"));
    const fetcher = async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 });
      if (url === "https://api.igdb.com/v4/games") {
        const body = String(init?.body ?? "");
        const start = Number(body.match(/first_release_date >= (\d+)/)?.[1] ?? 0);
        return new Response(JSON.stringify([{ id: start, name: `Historical ${start}`, first_release_date: start }]), { status: 200 });
      }
      throw new Error(`unexpected URL ${url}`);
    };

    try {
      await runCommand("backfill", {
        rootDir,
        env: { PIPELINE_AS_OF: "2026-07-29T00:00:00.000Z", TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
        logger: console,
        fetcher: fetcher as typeof fetch,
      }, ["--start", "1990-01-01", "--end", "1992-01-01"]);

      expect(existsSync(join(rootDir, "data/raw/igdb/backfill/1990-01-01_1991-01-01_000000.json"))).toBe(true);
      expect(existsSync(join(rootDir, "data/raw/igdb/backfill/1991-01-01_1992-01-01_000000.json"))).toBe(true);
      expect(existsSync(join(rootDir, "data/raw/igdb/backfill/1990-01-01_1992-01-01.json"))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("resumes a failed backfill from the saved page file without duplicating pages", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "workflow-cli-resume-"));
    let invocation = 0;
    const firstFetcher = async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 });
      if (url === "https://api.igdb.com/v4/games") {
        invocation += 1;
        if (invocation === 1) {
          return new Response(JSON.stringify(Array.from({ length: 500 }, (_, index) => ({ id: index + 1, name: `Game ${index + 1}`, first_release_date: 631152000 }))), { status: 200 });
        }
        throw new Error("simulated page failure");
      }
      throw new Error(`unexpected URL ${url} ${String(init?.body ?? "")}`);
    };

    try {
      await expect(runCommand("backfill", {
        rootDir,
        env: { PIPELINE_AS_OF: "2026-07-29T00:00:00.000Z", TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
        logger: console,
        fetcher: firstFetcher as typeof fetch,
      }, ["--start", "1990-01-01", "--end", "1991-01-01"])).rejects.toThrow("simulated page failure");

      const firstPage = join(rootDir, "data/raw/igdb/backfill/1990-01-01_1991-01-01_000000.json");
      expect(JSON.parse(readFileSync(firstPage, "utf8")).games).toHaveLength(500);

      const secondFetcher = async (url: string, init?: RequestInit) => {
        if (url === "https://id.twitch.tv/oauth2/token") return new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 });
        if (url === "https://api.igdb.com/v4/games") return new Response(JSON.stringify([{ id: 501, name: "Game 501", first_release_date: 631152000 }]), { status: 200 });
        throw new Error(`unexpected URL ${url} ${String(init?.body ?? "")}`);
      };
      await runCommand("backfill", {
        rootDir,
        env: { PIPELINE_AS_OF: "2026-07-29T00:00:00.000Z", TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
        logger: console,
        fetcher: secondFetcher as typeof fetch,
      }, ["--start", "1990-01-01", "--end", "1991-01-01"]);

      const secondPage = join(rootDir, "data/raw/igdb/backfill/1990-01-01_1991-01-01_000500.json");
      expect(JSON.parse(readFileSync(secondPage, "utf8")).games).toEqual([{ id: 501, name: "Game 501", first_release_date: 631152000 }]);
      expect(JSON.parse(readFileSync(firstPage, "utf8")).games).toHaveLength(500);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Pages-safe static assets", () => {
  it("does not reference the missing root-absolute Vite favicon", () => {
    expect(indexHtml).not.toContain('/vite.svg');
  });
});
