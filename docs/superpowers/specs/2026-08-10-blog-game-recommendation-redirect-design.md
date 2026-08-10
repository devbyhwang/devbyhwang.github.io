# 블로그 게임 추천 페이지 리다이렉트 설계

## 목표

기존 블로그의 게임 추천 진입점에서 Mohaji로 즉시 이동시키고, 블로그
Playground 카드는 Mohaji를 직접 새 탭으로 연다. 이번 변경은 리다이렉트와
Playground 링크 동작만 다루며 기존 게임 추천 소스, 파이프라인, 데이터,
워크플로는 삭제하지 않는다.

## 고정 경계

- 대상 URL은 `https://mohaji-ci1.pages.dev/`이다.
- 기존 공개 진입점은 `/playground/game-recommendation/`이다.
- `/playground/game-recommendation/index.html`도 같은 정적 문서를 제공한다.
- 저장소, GitHub Pages, 기존 파일과 과거 커밋을 삭제하거나 비공개로
  전환하지 않는다.
- force push, history rewrite, rebase를 하지 않는다.
- 커밋 `18257f9f75b3223386e87a5b8941fce0d9e7342b`의 도달 가능성을 유지한다.
- `src/playground/game-recommendation/index.njk`는 향후 별도 삭제 작업에서도
  보존해야 하는 영구 리다이렉트 진입점이다.

## 리다이렉트 방식

GitHub Pages는 `_redirects` 규칙을 처리하지 않으므로 정적 HTML 문서를
사용한다. 문서는 다음 세 계층을 함께 제공한다.

1. `location.replace("https://mohaji-ci1.pages.dev/")`를 점진적 향상으로
   실행해 JavaScript 사용 가능 환경에서 리다이렉트 페이지가 브라우저
   히스토리에 남지 않게 한다.
2. `0`초 meta refresh를 유지해 JavaScript가 없거나 실패해도 즉시 이동한다.
3. 같은 URL을 가리키는 canonical 링크와 화면에 보이는 fallback 링크를
   제공한다.

JavaScript는 유일한 이동 수단이 아니며, 대상 URL을 동적으로 계산하지
않는다. 모든 계층은 정확히 같은 HTTPS URL을 사용한다.

옛 URL의 query string과 hash는 Mohaji 루트로 전달하지 않는다. 옛 서비스와
새 서비스의 URL 상태 계약이 다르므로 값을 추측해 이식하는 것보다 새
서비스의 정상 진입점에서 시작하는 편이 안전하다.

## Eleventy 출력

Eleventy는 게임 추천 디렉터리 전체를 일반 Playground 정적 자산처럼
복사하지 않고, 리다이렉트 템플릿만 다음 파일로 출력한다.

```text
src/playground/game-recommendation/index.njk
  -> _site/playground/game-recommendation/index.html
```

GitHub Pages의 디렉터리 인덱스 해석 때문에 trailing-slash URL과 명시적인
`index.html` URL이 동일한 문서를 사용한다. 기존 React 앱과 데이터는
저장소에 보존하되 블로그의 공개 진입점 빌드에서는 실행하지 않는다.

## Playground 카드

게임 추천 카드는 `오늘 뭐 켜지? · Mohaji`처럼 서비스 이름과 외부 서비스임을
드러내고, 중간 블로그 URL이 아니라 대상 URL을 직접 가리킨다.

Mohaji 카드는 외부 서비스로 이동하므로 다음 계약을 사용한다.

```html
target="_blank" rel="noopener"
```

Mohaji 카드에만 외부/새 탭 동작을 나타내는 `↗` 표시를 추가하고 접근 가능한
이름에 `새 탭에서 열기`를 포함한다. 같은 블로그 안의 나머지 Playground
카드는 현재와 같이 같은 탭에서 열고 `↗`를 표시하지 않는다. 링크 데이터에
명시적인 외부 링크 속성을 두어 템플릿이 URL 문자열을 추측하지 않게 한다.

## 기존 삭제 초안 격리

현재 로컬 브랜치의 선행 커밋에는 리다이렉트와 함께 3,329개 파일 삭제가
섞여 있다. 구현은 히스토리를 다시 쓰지 않고 Git의 분기점 기준 파일 바이트를
그대로 복원하는 additive 커밋을 사용한다. 삭제 파일을 수동으로 재생성하지
않는다.

브랜치 위생과 pinned 복구 자산은 서로 다른 기준으로 확인한다. push 전 최종
aggregate diff는 다음 조건을 모두 만족해야 한다.

```text
git diff --diff-filter=D --name-only origin/main...HEAD
  -> 출력 없음

git diff --summary origin/main...HEAD
  -> delete mode 없음

data/raw/steam/all/*.json
  -> 87개

data/raw/igdb/backfill/*.json
  -> 608개

git merge-base --is-ancestor \
  18257f9f75b3223386e87a5b8941fce0d9e7342b HEAD
  -> exit 0
```

수정 파일의 링크나 빌드 명령을 교체하면 `--stat`의 줄 삭제 수는 0보다 클 수
있으므로, 파일 삭제 여부는 `origin/main...HEAD`의 `--diff-filter=D`와
`delete mode`로 판정한다. `18257f9…`는 브랜치 삭제 기준이 아니라 pinned
코퍼스 개수와 커밋 도달 가능성 검증에만 사용한다. 기존 사용자 소유 미추적
파일은 복원·구현 커밋에 포함하지 않는다.

## 검증

자동 검증은 빌드된 정적 문서를 대상으로 다음을 확인한다.

- meta refresh, `location.replace`, canonical, fallback 링크가 모두 정확한
  Mohaji URL을 사용한다.
- fallback은 JavaScript 없이도 사용 가능하다.
- Playground 카드가 Mohaji를 직접 가리키고 옛 블로그 URL을 사용하지 않는다.
- Mohaji 카드에만 `target="_blank" rel="noopener"`와 `↗`가 있고 내부
  Playground 카드에는 없다.
- 빌드 결과에 `_site/playground/game-recommendation/index.html`이 존재한다.
- 기존 테스트, 타입 검사, Eleventy production build가 통과한다.
- 기준 커밋 대비 삭제 파일이 없고 두 pinned raw 페이지 집합의 개수가
  87개와 608개다.
- 기준 커밋이 현재 HEAD의 조상으로 남아 있다.

배포 후에는 다음 두 URL을 각각 직접 열어 최종 URL이 Mohaji인지 확인한다.

```text
https://devbyhwang.github.io/playground/game-recommendation/
https://devbyhwang.github.io/playground/game-recommendation/index.html
```

배포 전에는 로컬 검증과 변경 파일 목록 제시까지만 수행한다. push는 별도
확인 전 실행하지 않는다.
