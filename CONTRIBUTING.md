# Contributing

기여에 관심 가져주셔서 감사합니다. 이 저장소의 기여는 크게 두 가지입니다.

1. 기술 기여 (버그 수정, 빌드/설정/문서 개선)
2. 콘텐츠 기여 (브랜드별 새 글 추가)

## 공통 원칙
- 변경 목적과 범위를 PR 설명에 명확히 작성해주세요.
- 큰 변경은 먼저 이슈로 방향을 합의한 뒤 진행해주세요.
- 기존 글의 의견/논지 자체를 바꾸는 PR은 받지 않습니다.

## 라이선스 귀속 규칙
- 코드 경로에 대한 기여는 MIT License로 기여됩니다.
- 콘텐츠 경로에 대한 기여는 CC BY-NC-SA 4.0으로 기여됩니다.
- 콘텐츠 경로의 기준은 `LICENSE-CONTENT`의 Scope를 따릅니다.
- 제3자 자료(코드, 폰트, 이미지, SDK 등)를 포함할 경우, 기여자는 사용 권한을 보유해야 하며 원저작권/원라이선스를 PR 설명에 명시해야 합니다.

## 1) 기술 기여

### 환영하는 변경
- 오타, 깨진 링크, 레이아웃/스타일 오류
- Eleventy 설정/빌드 파이프라인 개선
- 문서 정확성 개선

### 권장 절차
1. 이슈로 문제/개선점을 공유
2. 브랜치에서 수정 후 PR 제출
3. UI 변경이 있으면 스크린샷 첨부

### 체크 포인트
- 변경은 최소 범위로 유지
- 무거운 신규 의존성 추가는 지양
- 필요 시 `npm run build`로 빌드 검증

## 2) 콘텐츠 기여 (새 글 추가)

### A. DevByHwang 글
- 경로: `src/devbyhwang/blog/YYYY-MM-DD-title.md`
- 참고: `src/devbyhwang/blog/` 디렉터리가 없다면 먼저 생성한 뒤 글 파일을 추가하세요.
- 레이아웃: `layouts/post.njk`
- 카테고리: `devlog | info | freelance | games`

```yaml
---
layout: layouts/post.njk
title: "글 제목"
date: 2026-04-04
category: devlog
excerpt: "한 줄 요약"
---
```

선택 고급 메타데이터 예시:

```yaml
---
views: 350
---
```

### B. Underground Novel 글
- 경로: `src/dodoes/writing/YYYY-MM-DD-title.md`
- 레이아웃: `layouts/writing.njk`
- 카테고리: `novel | notes`

```yaml
---
layout: layouts/writing.njk
title: "글 제목"
date: 2026-04-04
category: notes
description: "짧은 요약"
---
```

선택 고급 메타데이터 예시:

```yaml
---
excerpt: "본문 일부 요약"
views: 42
---
```

### 콘텐츠 작성 가이드
- 마크다운 형식 사용
- 인용/참고 자료가 있으면 출처 명시
- front matter 필수 필드: `layout`, `title`, `date`, `category`
- front matter 선택 필드:
  - Dev 글: `excerpt`, `views`
  - Writing 글: `description`, `excerpt`, `views`
- `views`는 글별 조회수 자동 집계에 더해지는 초기 시드값이며, 없으면 `0`입니다.
- 인기글 정렬은 `effective views = seed views + runtime views` 기준입니다.

## PR 제출 예시

```bash
git add README.md CONTRIBUTING.md
# 또는
# git add src/devbyhwang/blog/YYYY-MM-DD-title.md
# git add src/dodoes/writing/YYYY-MM-DD-title.md
git commit -m "docs: sync markdown docs with current structure"
git push origin <your-branch>
```

PR 생성 후 템플릿 체크리스트를 채워주세요.
