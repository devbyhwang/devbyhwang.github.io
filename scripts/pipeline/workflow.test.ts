import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const refresh = readFileSync(".github/workflows/catalog-refresh.yml", "utf8");
const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

describe("catalog refresh deployment handoff", () => {
  it("deploys after the named refresh workflow completes successfully", () => {
    expect(deploy).toContain("workflow_run:");
    expect(deploy).toContain('workflows: ["Refresh game catalog"]');
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
  });

  it("checks out main after refresh while retaining human push and dispatch triggers", () => {
    expect(deploy).toContain("push:");
    expect(deploy).toContain("workflow_dispatch:");
    expect(deploy).toContain("github.event_name == 'workflow_run' && 'main' || github.sha");
  });

  it("keeps source and deployment permissions narrowly scoped", () => {
    expect(refresh).toMatch(/permissions:\n  contents: write/);
    expect(refresh).not.toMatch(/pages:|id-token:/);
    expect(deploy).toMatch(/permissions:\n  contents: read\n  pages: write\n  id-token: write/);
  });
});

describe("Pages-safe static assets", () => {
  it("does not reference the missing root-absolute Vite favicon", () => {
    expect(indexHtml).not.toContain('/vite.svg');
  });
});
