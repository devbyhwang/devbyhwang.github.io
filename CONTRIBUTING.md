# Contributing

Thanks for your interest! There are two ways to contribute:

1. **Technical improvements** (bug fixes, build improvements)
2. **Philosophy notes** (contribute to 황라투스트라의 놀이터)

---

## 황라투스트라의 놀이터에 기여하기

철학적 단상과 질문을 함께 나누는 공간입니다. 누구나 자신의 사유를 제출할 수 있습니다.

### 기여 방법

#### 1. 준비
- GitHub 계정 필요
- 마크다운 문법 기본 이해
- 철학적 단상, 질문, 독서 노트 등 짧은 글 (500-2000자 권장)

#### 2. 노트 작성

**2.1. 저장소 포크**
1. 이 저장소를 Fork합니다
2. 로컬에 클론: `git clone https://github.com/YOUR_USERNAME/devbyhwanghub.io.git`

**2.2. 파일 생성**
- 경로: `src/zarathustra/YYYY-MM-DD-제목.md`
- 파일명 규칙: 날짜-제목 (예: `2026-02-15-존재와-시간.md`)

**2.3. 프론트매터 작성**
```yaml
---
layout: layouts/philosophy.njk
title: "당신의 글 제목"
description: "짧은 요약 (한 줄)"
date: YYYY-MM-DD
category: philosophy
tags:
  - 태그1
  - 태그2
discussion: true
showInMainFeed: false
---
```

**2.4. 내용 작성**
- 마크다운 형식
- 짧고 명확한 사유
- 개인적 경험, 질문, 독서 노트 환영
- 완성된 논문보다 진행 중인 생각을 선호

#### 3. Pull Request 제출

```bash
git add src/zarathustra/YYYY-MM-DD-제목.md
git commit -m "Add: 제목"
git push origin main
```

GitHub에서 Pull Request를 생성하고 템플릿을 작성합니다.

### 가이드라인

**✅ 환영하는 글**
- 철학적 질문과 사색
- 독서 노트 (철학/인문 서적)
- 일상에서 발견한 철학적 통찰
- 개인적 경험의 성찰

**❌ 적합하지 않은 글**
- 정치적 선동
- 타인 비방
- 광고/홍보
- 비철학적 일상 기록

**📏 형식 규칙**
- 길이: 500-2000자 권장
- 인용 출처: 반드시 명시
- 태그: 3-5개 권장

---

## Technical Contributions

For bug fixes, build improvements, and technical changes:

### What I accept
- Typos, broken links, and layout bugs
- Build/config fixes
- Small quality-of-life improvements

### Content policy
- Personal blog posts are not open for edits to meaning or opinions
- If you spot factual errors or typos in a post, open an issue first
- Please do not submit PRs that rewrite posts without prior agreement

### How to contribute
1. Open an issue describing the problem or suggestion
2. If approved, submit a PR with a clear summary and screenshots when relevant

### Style
- Keep changes minimal and consistent with existing patterns
- Avoid adding heavy dependencies

---

Thanks for helping!
