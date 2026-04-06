# novel-proxy Worker

Cloudflare Worker for `POST /v1/novel-feedback`.

## Features
- AI provider proxy (Gemini default, OpenAI fallback via flag)
- CORS allowlist via `ALLOWED_ORIGIN`
- Turnstile token verification + signed captcha session token (tab-first verification, 6h TTL)
- Daily rate limit (5/day) via Durable Object (atomic)
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
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put CAPTCHA_SESSION_SECRET_KEY
npx wrangler secret put OWNER_BYPASS_KEY
```
`ALLOWED_ORIGIN` is already set in `wrangler.jsonc` as `https://devbyhwang.github.io`.
`AI_PROVIDER` is set to `gemini` by default (`openai` for rollback).
`GEMINI_MODEL` is set to `gemini-2.0-flash` by default.
`TURNSTILE_EXPECTED_HOSTNAME` is set to `devbyhwang.github.io`.
`TURNSTILE_EXPECTED_ACTION` is set to `novel_feedback`.
`ENABLE_OWNER_BYPASS` is currently set to `"true"` in `wrangler.jsonc`.

4. Turnstile setup:
- Cloudflare Turnstile에서 위젯을 생성하고 도메인에 `devbyhwang.github.io`를 등록합니다.
- 발급받은 Secret Key는 `TURNSTILE_SECRET_KEY`로 저장합니다.
- 발급받은 Site Key는 `src/demos/novel-assistant/index.html`의 `TURNSTILE_SITE_KEY` 값으로 설정합니다.
- 위젯 action은 `novel_feedback`으로 설정되며, 워커는 hostname/action 검증이 일치해야 통과합니다.
- Turnstile 성공 시 워커가 서명한 `captchaSession` 토큰(HMAC-SHA256, TTL 6시간)을 발급합니다.

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
  "checks": ["s3_three_act_spine"],
  "turnstileToken": "...",
  "captchaSession": "...",
  "meta": { "lang": "ko", "version": "v2", "curriculumStage": "s3" }
}
```
`checks`는 문자열 배열이며, 현재 프런트(`src/demos/novel-assistant`)는 단일 항목만 전송합니다.
- `turnstileToken`은 유효한 `captchaSession`이 없을 때 필수입니다.
- `captchaSession`은 이전 성공 응답의 `security.captchaSession` 값을 재사용할 때 전달합니다.

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
      "id": "s3_three_act_spine",
      "label": "3막 척추 설계",
      "score": 8,
      "evidence": ["..."],
      "suggestion": "..."
    }
  ],
  "usage": {
    "remainingToday": 1,
    "limitPerDay": 5
  },
  "security": {
    "captchaSession": "...",
    "captchaSessionExpiresAt": "2026-04-06T12:34:56.000Z"
  }
}
```
- `security`는 Turnstile 재검증으로 새 세션이 발급된 요청에서 포함됩니다.

## Captcha session behavior
- 최초 요청(또는 세션 만료/무효 시): Turnstile 검증 필요
- Turnstile 성공 시: 새 `captchaSession` 발급
- 이후 같은 탭 세션: `captchaSession`으로 재검증 생략 가능
- 탭 종료 후 새 탭 진입 시: 클라이언트 `sessionStorage`가 초기화되어 다시 Turnstile 필요
- 변조/만료된 `captchaSession`만 전송 시: `INVALID_CAPTCHA`(403)

## Error codes
- `BAD_REQUEST`
- `FORBIDDEN_ORIGIN`
- `INVALID_CAPTCHA`
- `RATE_LIMITED`
- `METHOD_NOT_ALLOWED`
- `PAYLOAD_TOO_LARGE`
- `UNSUPPORTED_MEDIA_TYPE`
- `UPSTREAM_ERROR`

## Regression checklist
1. Gemini 기본 경로
- `AI_PROVIDER=gemini`, `GEMINI_API_KEY` 유효
- 200 + `overallScore/summary/items/usage` 구조 확인
2. Gemini 키 누락
- `AI_PROVIDER=gemini`, `GEMINI_API_KEY` 미설정
- 502 + `UPSTREAM_ERROR`
3. OpenAI 롤백 경로
- `AI_PROVIDER=openai`, `OPENAI_API_KEY` 유효
- 200 + 기존 응답 구조 동일
4. 제공자 값 이상치
- `AI_PROVIDER=invalid`
- 내부적으로 gemini 경로 사용
5. 기존 보안/제한 회귀
- Turnstile 실패: `INVALID_CAPTCHA`
- 변조/만료 captcha session 단독 전송: `INVALID_CAPTCHA`
- 일일 제한 초과: `RATE_LIMITED`
- 12,000자 초과: `PAYLOAD_TOO_LARGE`

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
