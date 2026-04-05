# Novel Assistant Demo

정적 페이지(`index.html`)는 브라우저에서 원고/점검 항목을 수집해 프록시 API로 전달합니다.

## 엔드포인트
- `POST /v1/novel-feedback`

## 요청 예시
```json
{
  "manuscript": "...",
  "preset": "...",
  "checks": ["lock_training"],
  "turnstileToken": "...",
  "meta": {
    "lang": "ko",
    "version": "v1"
  }
}
```

## 선택 헤더 (테스트 전용)
- `X-Owner-Key: <owner key>`
- 워커에서 `ENABLE_OWNER_BYPASS=true` + `OWNER_BYPASS_KEY` 일치 시에만 적용됩니다.

## 응답 예시
```json
{
  "overallScore": 7.8,
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

## 보안 원칙
- 개인 API 키 입력 기능 없음 (서버 키 전용)
- OpenAI 키는 프록시 환경 변수/시크릿에서만 관리
- 브라우저 코드/리포지토리에 키 저장 금지
- 프록시에 Origin 제한 + Turnstile 검증 + Durable Object 기반 원자적 rate limit 적용
- `manuscript`는 최대 12,000자까지 허용
- 테스트 종료 후 `ENABLE_OWNER_BYPASS=false`로 즉시 비활성화하고 관련 코드 블록 삭제 권장
