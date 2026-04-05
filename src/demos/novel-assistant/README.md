# Novel Assistant Demo

정적 페이지(`index.html`)는 Plot & Structure 기반의 구조형 학습 로드맵을 상단에 표시하고,
선택한 노드의 입력 템플릿 + 원고 본문을 합성해 프록시 API로 전달합니다.
사용자 표면(UI)은 한글 우선 + 영문 병기 용어 정책으로 구성합니다.

## 엔드포인트
- `POST /v1/novel-feedback`

## UI 구조
- 헤더 아래: 3단계 온보딩 카드
  - `핵심 4요소(LOCK) 선택 → 입력칸 작성 → 분석 반영`
- 상단: 구조형 학습 로드맵(SVG 5레인)
  - `핵심 4요소(LOCK) / 시작 / 중간 / 끝 / 수정(Revision)`
- 하단: 연습 입력/실행/결과

## 용어 사전 (UI 표시용)
- `주인공(Lead)`
- `지배 목표(Objective)`
- `대립(Confrontation)`
- `결정타 결말(Knockout)`
- `핵심 4요소(LOCK)`
- `문턱 사건 1/2 (Doorway 1/2)`
- `교란 사건(Disturbance)`
- `촉발 사건(Inciting Incident)`
- `중간 전환점(Midpoint)`
- `전환 사건(Plot Point)`
- `수정 우선순위 분류(Triage)`
- `보여주기/말하기(Show/Tell)`

## 로드맵 노드 모델
- `drill` 단일 노드 모델
- `laneId`
  - `lock`, `beginning`, `middle`, `ending`, `revision`
- 노드 선택 시 항상 입력 템플릿과 분석 루프로 바로 진입

## 구조형 학습 흐름
1. 온보딩의 `첫 단계 시작하기` 또는 상단 로드맵에서 노드를 선택합니다.
2. 뷰 탭(`전체/핵심 4요소(LOCK)/시작/중간/끝/수정`)으로 레인 집중도를 바꿉니다.
3. 선택 노드의 템플릿 입력칸을 채웁니다. (필수)
4. 필요 시 `원고 본문 (선택)`을 추가합니다.
5. 분석 실행 시 프런트가 연습 입력 + 본문을 `manuscript`로 합성해 전송합니다.

## 분석 규칙
- 요청 단위는 기본적으로 선택 노드 1개이며, `checks`에 선택 노드 ID를 담아 보냅니다.
- 실습 노드 ID만 사용합니다.

## 완료 상태 규칙 (수동 + 자동)
- 자동 완료: 해당 노드 최근 점수 `>= 7.5`
- 수동 완료/수동 해제: 사용자가 직접 오버라이드 가능
- 자동 따르기: 수동 오버라이드를 해제하고 자동 상태를 따름

## 로컬 임시저장 (v2)
- `localStorage` 자동 저장 (입력 후 약 200ms)
- 키:
  - `novel-assistant:curriculum:v2`
    - `selectedNodeId`, `activeTab`, `perNode` 저장
    - 이전 구조(`lastSelectedDrillId`, `perDrill`)에서 마이그레이션 지원
  - `novel-assistant:draft:<nodeId>:v2` (노드별 연습 입력 draft)
  - `novel-assistant:body:v2` (선택 원고 본문)

## 요청 예시
```json
{
  "manuscript": "...",
  "preset": "...",
  "checks": ["s2_scene_goal_conflict_change"],
  "turnstileToken": "...",
  "meta": {
    "lang": "ko",
    "version": "v2",
    "nodeKind": "drill",
    "nodeLane": "middle",
    "curriculumStage": "middle"
  }
}
```

## 선택 헤더 (테스트 전용)
- `X-Owner-Key: <owner key>`
- 워커에서 `ENABLE_OWNER_BYPASS=true` + `OWNER_BYPASS_KEY` 일치 시에만 적용됩니다.
- UI에서는 기본 비노출이며, `ENABLE_OWNER_BYPASS_UI`를 켠 경우에만 입력칸이 보입니다.

## 응답 예시
```json
{
  "overallScore": 7.8,
  "summary": "...",
  "items": [
    {
      "id": "s2_scene_goal_conflict_change",
      "label": "장면 목적-충돌-변화",
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
