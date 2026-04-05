# novel-proxy Worker

Cloudflare Worker for `POST /v1/novel-feedback`.

## Features
- OpenAI Responses API proxy (server key only)
- CORS allowlist via `ALLOWED_ORIGIN`
- Turnstile token verification (required: success + hostname + action)
- Daily rate limit (2/day) via Durable Object (atomic)
- Manuscript length limit (max 12,000 chars)
- Optional owner-only bypass for temporary testing (`ENABLE_OWNER_BYPASS`, `OWNER_BYPASS_KEY`)

## Files
- `src/index.js`: Worker handler
- `wrangler.jsonc`: Worker config

## Setup
1. Install dependencies:
```bash
cd workers/novel-proxy
npm install
```

2. Authenticate for non-interactive shell:
```bash
export CLOUDFLARE_API_TOKEN=your_token_here
```

3. Set secrets:
```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put OWNER_BYPASS_KEY
```
`ALLOWED_ORIGIN` is already set in `wrangler.jsonc` as `https://devbyhwang.github.io`.
`TURNSTILE_EXPECTED_HOSTNAME` is set to `devbyhwang.github.io`.
`TURNSTILE_EXPECTED_ACTION` is set to `novel_feedback`.
`ENABLE_OWNER_BYPASS` is set to `"false"` by default in `wrangler.jsonc`.

4. Turnstile setup:
- Cloudflare Turnstile에서 위젯을 생성하고 도메인에 `devbyhwang.github.io`를 등록합니다.
- 발급받은 Secret Key는 `TURNSTILE_SECRET_KEY`로 저장합니다.
- 발급받은 Site Key는 `src/demos/novel-assistant/index.html`의 `TURNSTILE_SITE_KEY` 값으로 설정합니다.
- 위젯 action은 `novel_feedback`으로 설정되며, 워커는 hostname/action 검증이 일치해야 통과합니다.

5. Durable Object migration + deploy:
```bash
npm run dev
npm run deploy
```

After deploy, use:
- `https://novel-proxy.<your-workers-subdomain>.workers.dev/v1/novel-feedback`

## Request body
```json
{
  "manuscript": "...",
  "preset": "...",
  "checks": ["lock_training"],
  "turnstileToken": "...",
  "meta": { "lang": "ko", "version": "v1" }
}
```

## Optional request header (test-only owner bypass)
- `X-Owner-Key: <owner key>`
- Works only when:
  - `ENABLE_OWNER_BYPASS === "true"`
  - request `Origin` matches `ALLOWED_ORIGIN`
  - header matches `OWNER_BYPASS_KEY`
- When active, Turnstile and daily limit are bypassed for that request.

## Success response
```json
{
  "overallScore": 8.1,
  "summary": "...",
  "items": [
    {
      "id": "lock_training",
      "label": "LOCK 훈련",
      "score": 8,
      "evidence": ["..."],
      "suggestion": "..."
    }
  ],
  "usage": {
    "remainingToday": 1,
    "limitPerDay": 2
  }
}
```

## Error codes
- `BAD_REQUEST`
- `FORBIDDEN_ORIGIN`
- `INVALID_CAPTCHA`
- `RATE_LIMITED`
- `METHOD_NOT_ALLOWED`
- `PAYLOAD_TOO_LARGE`
- `UNSUPPORTED_MEDIA_TYPE`
- `UPSTREAM_ERROR`

## Test-only bypass lifecycle
1. Enable for testing:
```bash
npx wrangler secret put OWNER_BYPASS_KEY
```
Set `ENABLE_OWNER_BYPASS` to `"true"` and deploy.

2. Disable immediately after testing:
Set `ENABLE_OWNER_BYPASS` back to `"false"` and deploy.

3. Remove permanently:
Delete `// TEST_ONLY_OWNER_BYPASS_START` ~ `// TEST_ONLY_OWNER_BYPASS_END` blocks from:
- `workers/novel-proxy/src/index.js`
- `src/demos/novel-assistant/index.html`

Then remove related docs/config entries.
