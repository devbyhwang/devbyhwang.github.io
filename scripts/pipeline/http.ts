import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HttpClient } from "./model";

const retryDelaysMs = [1_000, 2_000, 4_000];

function isRetriable(status: number): boolean {
  return status === 429 || status >= 500;
}

function errorFor(url: string, status: number, body: string): Error {
  return new Error(`${url}: ${status}: ${body.slice(0, 200)}`);
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetcher(url, init);
    if (response.ok) return response.json() as Promise<T>;

    const body = await response.text();
    if (!isRetriable(response.status) || attempt === retryDelaysMs.length) {
      throw errorFor(url, response.status, body);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
  }
}

async function requestJsonResponse<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; headers: Record<string, string>; data?: T }> {
  const response = await fetcher(url, init);
  const headers = Object.fromEntries(response.headers.entries());
  return response.ok
    ? { status: response.status, headers, data: await response.json() as T }
    : { status: response.status, headers };
}

export function createHttpClient(fetcher: typeof fetch = fetch): HttpClient {
  return {
    getJson: <T>(url: string, headers?: Record<string, string>) => requestJson<T>(fetcher, url, { headers }),
    getJsonResponse: <T>(url: string, headers?: Record<string, string>) => requestJsonResponse<T>(fetcher, url, { headers }),
    postJson: <T>(url: string, body: string, headers?: Record<string, string>) => requestJson<T>(fetcher, url, {
      method: "POST",
      body,
      headers,
    }),
  };
}

export async function saveRaw(path: string, body: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(body)}\n`, "utf8");
  await rename(temporaryPath, path);
}
