# Mohaji 서비스 분리 설계

## 목표

게임 추천기를 `devbyhwang/mohaji`의 독립 서비스로 이전하고, 블로그는 가벼운 콘텐츠 사이트로 유지한다. 기존 블로그 경로는 새 서비스로 리다이렉트한다. 생성 카탈로그와 수집 이력은 Git 및 GitHub Pages 배포물에서 제거해 용량 제한을 피한다.

## 결정

- 앱·수집 파이프라인·테스트의 정식 소유 저장소는 `devbyhwang/mohaji`다.
- 배포 초기 주소는 무료 Cloudflare Pages 주소 `mohaji.pages.dev`다. 커스텀 도메인은 이번 범위에 포함하지 않는다.
- 공개 카탈로그·탐색 인덱스와 파이프라인 이력은 Cloudflare R2에 저장한다.
- 블로그의 기존 `/playground/game-recommendation/` 주소는 새 서비스로 영구 리다이렉트한다.
- 이전 완료 전까지 기존 블로그 추천기 산출물은 삭제하지 않는다. 새 서비스가 배포·검증된 뒤 별도 정리 커밋에서 제거한다.

## 구성

```text
GitHub Actions (mohaji)
  ├─ 매일: API 수집 → R2의 history/raw 갱신 → R2의 공개 catalog 갱신
  └─ push: 테스트 → Cloudflare Pages 앱 배포

Cloudflare Pages (mohaji.pages.dev)
  └─ React 추천 앱
       └─ 같은 공개 R2 버킷의 catalog / exploration 파일 요청

GitHub Pages (devbyhwang.github.io)
  └─ /playground/game-recommendation/ → mohaji.pages.dev (301/정적 리다이렉트)
```

R2 객체는 현재 생성본을 가리키는 manifest와 버전별 prefix로 쓴다. 파이프라인은 새 버전 전체를 업로드한 뒤 manifest를 마지막에 바꾼다. 따라서 실패한 실행이 반쪽짜리 카탈로그를 공개하지 않는다.

## 데이터 보존과 크기 정책

- 추천에 쓰는 7·30·90일 지표만 유지하도록 Twitch 관측이 있는 게임의 90일 이력만 저장한다.
- 게임 전체의 매일 0 시청 기록은 저장하지 않는다.
- R2에는 `raw/`, `history/`, `releases/<generatedAt>/`, `current.json`을 둔다.
- 이전 릴리스는 명시한 보존 수를 넘으면 lifecycle 규칙으로 제거한다.
- 앱은 R2의 공개 읽기 전용 경로만 사용하고, 쓰기 권한은 GitHub Actions 비밀값에만 둔다.

## Actions 정리

### 블로그 저장소

- `catalog-refresh.yml`, `catalog-backfill.yml`을 제거한다.
- 블로그 배포 workflow에서 추천기 카탈로그 검증과 대형 산출물 검사를 제거한다.
- 블로그 빌드·테스트는 블로그 코드만 대상으로 축소한다.

### mohaji 저장소

- 기존 카탈로그 갱신 workflow를 이전하고, Git 커밋 대신 R2에 쓰도록 바꾼다.
- Cloudflare Pages 배포 workflow는 앱 코드 변경 시 테스트·타입 검사 후 배포한다.
- 수집 workflow는 R2 쓰기 권한, Twitch/IGDB, Chzzk 비밀값만 사용한다.
- 배포 workflow와 수집 workflow는 서로 다른 권한·동시 실행 그룹을 사용한다.

## 이전 순서와 롤백

1. `mohaji`에 앱·파이프라인·필수 지식 데이터·테스트를 이식한다.
2. R2와 Pages를 설정하고, 첫 생성본을 업로드한다.
3. 새 서비스에서 카탈로그 검증, 추천 여섯 바이브, 배포 확인을 한다.
4. 블로그에 리다이렉트를 추가하고 배포한다.
5. 충분한 확인 뒤 블로그의 대형 생성 산출물과 구 Actions를 제거한다.

새 서비스 검증 또는 R2 갱신이 실패하면 블로그 리다이렉트를 만들지 않는다. 리다이렉트 후 문제 발생 시 블로그의 직전 추천기 산출물을 즉시 복원하고 리다이렉트를 되돌린다.

## 필수 사전 조건

- Cloudflare 계정의 R2 버킷과 Pages 프로젝트 생성 권한
- GitHub Actions에 R2 접근 키, 버킷명, 공개 데이터 URL 등록
- GitHub Actions에 기존 Twitch/IGDB 및 Chzzk 비밀값을 `mohaji` 저장소로 복사
