# Novel Assistant Demo

정적 페이지(`index.html`)는 Plot & Structure-v2 기반 커리큘럼 로드맵에서 연습 항목을 선택하고,
항목별 입력값 + 선택 원고 본문을 합성해 프록시 API로 전달합니다.

## 엔드포인트
- `POST /v1/novel-feedback`
- 백엔드 AI 제공자 기본값: Gemini (`AI_PROVIDER=gemini`)

## 구조형 학습 흐름
1. 상단 로드맵(SVG 선형 노드)에서 연습 항목을 선택합니다.
2. 뷰 탭(`전체/거시 구조/미시 기술/막별 실행/수정 도구`)으로 노드 강조 범위를 바꿉니다.
3. 선택 항목의 템플릿 입력칸을 채웁니다. (필수)
4. 필요 시 `원고 본문 (선택)`을 추가합니다.
5. 분석 실행 시 프런트가 연습 입력 + 본문을 내부 문자열(`manuscript`)로 합성해 전송합니다.

## 커리큘럼/항목 규칙
- 코어 24개 항목
- 분석은 1회 1항목 고정 (`checks` 길이 1)
- 신규 ID 예시:
  - `s1_lock_lead`
  - `s3_three_act_spine`
  - `s4_middle_escalation_pressure`
  - `s5_revision_triage`

## 완료 상태 규칙 (수동 + 자동)
- 자동 완료: 해당 항목 최근 점수 `>= 7.5`
- 수동 완료/수동 해제: 사용자가 직접 오버라이드 가능
- 자동 따르기: 수동 오버라이드를 해제하고 자동 상태를 따름

## 로컬 임시저장 (v2)
- `localStorage` 자동 저장 (입력 후 약 200ms)
- 키:
  - `novel-assistant:curriculum:v2` (선택 항목, 활성 탭, 항목별 진행도)
  - `novel-assistant:draft:<drillId>:v2` (항목별 연습 입력 draft)
  - `novel-assistant:body:v2` (선택 원고 본문)

## 요청 예시
```json
{
  "manuscript": "...",
  "preset": "...",
  "checks": ["s3_three_act_spine"],
  "turnstileToken": "...",
  "meta": {
    "lang": "ko",
    "version": "v2",
    "curriculumStage": "s3"
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
  }
}
```

## 보안 원칙
- 개인 API 키 입력 기능 없음 (서버 키 전용)
- LLM API 키는 프록시 환경 변수/시크릿에서만 관리
- 브라우저 코드/리포지토리에 키 저장 금지
- 프록시에 Origin 제한 + Turnstile 검증 + Durable Object 기반 원자적 rate limit 적용
- `manuscript`는 최대 12,000자까지 허용
- 테스트 종료 후 `ENABLE_OWNER_BYPASS=false`로 즉시 비활성화하고 관련 코드 블록 삭제 권장
