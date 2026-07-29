# 게임 추천 Playground 통합 — 설계

작성일: 2026-07-29

## 목표

게임 추천 서비스를 별도 GitHub Pages 사이트로 배포하지 않고
`devbyhwang.github.io`의 `/playground/game-recommendation/`에 통합한다.
블로그 저장소를 서비스의 단일 소스와 단일 Pages 배포 대상으로 사용한다.

## 확정 결정

| 항목 | 결정 |
|---|---|
| 공개 URL | `/playground/game-recommendation/` |
| 정적 앱 | 기존 React/Vite 앱을 `game-recommendation/` 소스 디렉터리에서 빌드하고 `src/playground/game-recommendation/`으로 출력 |
| 블로그 빌드 | 기존 Eleventy 빌드 앞에 게임 추천 Vite 빌드를 실행 |
| 카탈로그 경로 | `src/playground/game-recommendation/catalog.json` |
| 파이프라인 | 기존 `scripts/pipeline`을 블로그 저장소로 이동하고 데이터·지식 자산은 저장소 루트 `data/`에 둔다 |
| 데이터 갱신 | 블로그 저장소의 GitHub Actions가 매일 00:00 UTC에 최신 데이터를 갱신하고, 별도 수동 workflow가 역사 데이터를 백필 |
| 배포 | 사람의 `main` push/수동 실행과 main 브랜치의 성공한 데이터 workflow 실행이 기존 블로그 `deploy.yml`의 Pages 배포를 트리거 |
| Playground 카드 | `src/_data/studio.js`에 `/playground/game-recommendation/` 링크 추가 |
| 기존 서비스 저장소 | 통합 후 별도 Pages 배포 대상으로 사용하지 않는다. 현재 standalone PR은 통합 PR과 분리한다 |

## 데이터 흐름

```text
Twitch / IGDB / Steam
        ↓
scripts/pipeline (data/knowledge + data/raw cache)
        ↓
src/playground/game-recommendation/catalog.json
        ↓
Vite build → src/playground/game-recommendation/{index.html,assets}
        ↓
Eleventy passthrough → _site/playground/game-recommendation/
        ↓
GitHub Pages
```

앱은 `./catalog.json`을 상대 경로로 읽으므로 GitHub Pages 루트와 하위 경로 모두에서
동작한다. 카탈로그에는 API secret을 포함하지 않으며 raw 응답에도 인증 토큰을 저장하지 않는다.

## 구현 경계

- `game-recommendation/`: React/Vite 소스와 프론트엔드 전용 타입체크·테스트 설정
- `scripts/pipeline/`: 외부 API 수집, 캐시 fallback, history, schema validation, catalog emit
- `data/`: pipeline knowledge, fixture, raw cache, history
- `src/playground/game-recommendation/`: Vite가 생성하는 Pages 정적 산출물
- `eleventy.config.js`: 생성된 정적 산출물을 기존 playground passthrough 규칙으로 복사
- `src/_data/studio.js`: Playground 목록 카드
- `.github/workflows/catalog-refresh.yml`: 수집과 데이터 커밋
- `.github/workflows/catalog-backfill.yml`: 지정한 기간의 IGDB 역사 데이터 백필과 checkpoint 커밋
- `.github/workflows/deploy.yml`: 기존 블로그 빌드와 Pages 배포를 유지

## 운영 및 실패 처리

- Twitch/IGDB secret은 블로그 저장소 Actions secrets에만 둔다.
- pipeline 실패 시 기존 raw cache fallback 정책을 유지한다.
- catalog가 이전 데이터보다 30% 이상 감소하면 emit을 거부한다.
- Actions는 `data/history.json`, `data/raw`, `data/checkpoints`, `src/playground/game-recommendation/catalog.json`,
  `src/playground/game-recommendation/catalog/chunks`만 갱신 커밋한다.
- 기존 legacy `catalog.json`도 첫 live refresh 전까지 읽을 수 있으며, 새 refresh/backfill은 manifest + chunks 형식으로 전환한다.
- 새 데이터 커밋은 `main` push로 기존 Pages 배포를 한 번 트리거한다.
- 사람의 `main` push와 수동 배포는 기존 `push`/`workflow_dispatch`로 처리하고, GitHub Actions 봇 커밋은 `workflow_run` 성공 트리거로 Pages 배포를 실행한다. 실패한 refresh/backfill은 배포하지 않는다.

## 완료 조건

- `/playground/game-recommendation/`이 Eleventy 산출물에 존재한다.
- Playground 목록에 게임 추천 카드가 표시되고 링크가 작동한다.
- `npm run build`가 게임 추천 Vite와 Eleventy를 모두 성공시킨다.
- `npm test`, game recommendation typecheck, pipeline fixture/validate가 통과한다.
- Actions 수동 실행으로 역사 백필과 최신 catalog 갱신, 기존 Pages 배포를 확인할 수 있다.
