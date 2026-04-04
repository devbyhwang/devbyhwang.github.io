# novel-proxy Worker

Cloudflare Worker for `POST /v1/novel-feedback`.

## Features
- OpenAI Responses API proxy (server key only)
- CORS allowlist via `ALLOWED_ORIGIN`
- Turnstile token verification (required)
- Daily rate limit (2/day) via Durable Object (atomic)
- Manuscript length limit (max 12,000 chars)

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
```
`ALLOWED_ORIGIN` is already set in `wrangler.jsonc` as `https://devbyhwang.github.io`.

4. Turnstile setup:
- Cloudflare Turnstile에서 위젯을 생성하고 도메인에 `devbyhwang.github.io`를 등록합니다.
- 발급받은 Secret Key는 `TURNSTILE_SECRET_KEY`로 저장합니다.
- 발급받은 Site Key는 `src/demos/novel-assistant/index.html`의 `TURNSTILE_SITE_KEY` 값으로 설정합니다.

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
  "checks": ["overall_review"],
  "turnstileToken": "...",
  "meta": { "lang": "ko", "version": "v1" }
}
```

## Success response
```json
{
  "overallScore": 8.1,
  "summary": "...",
  "items": [
    {
      "id": "overall_review",
      "label": "전체 진단",
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
