# Playground

Eleventy 사이트의 `/devbyhwang/playground/`에 노출되는 독립형 데모 모음입니다.

## 새 데모 추가하기

1. **디렉터리 생성**
   ```bash
   mkdir -p src/playground/your-demo-name
   ```

2. **`index.html` 작성**
   - `src/playground/_template.html`을 복사해 시작
   - 데모는 사이트 전역 CSS/JS에 의존하지 않도록 구성
   - 데모 내부 리소스는 상대 경로 기반으로 작성
   - 광고 배너가 필요한 데모만 `../../../assets/playground-bottom-ad.js`를 포함 (스크립트가 `playground-bottom-ad.css`를 자동 로드)
   - 광고 배너를 포함하는 경우 UI가 가려지지 않도록 핵심 루트에 `data-playground-safe-root` 부여

3. **`studio.js`에 카드 엔트리 추가** (`src/_data/studio.js`)
   ```js
   {
     title: "Your Demo Name",
     blurb: "한 줄 설명",
     links: [{ label: "Launch", href: "/devbyhwang/playground/your-demo-name/" }],
     preview: "/assets/your-demo-preview.png",
   }
   ```

4. **로컬 확인**
   ```bash
   npm run dev
   # http://localhost:8080/devbyhwang/playground/your-demo-name/
   ```

빌드는 `src/playground/<slug>/` 형태의 디렉터리를 자동으로 `/devbyhwang/playground/<slug>/`에 복사합니다. `_`로 시작하는 디렉터리와 `README.md`, `_template.html` 같은 소스용 파일은 배포 산출물에 포함하지 않습니다.

## 요구사항
- **반응형**: 모바일/데스크톱 모두 동작
- **독립형**: 데모 단독으로 실행 가능
- **PATH_PREFIX 호환**: 절대 경로 하드코딩 지양, 상대 경로 우선
- **백 네비게이션**: `../` 링크 유지
- **비밀키 금지**: 데모 HTML/JS에 API 키 하드코딩 금지
- **광고 UI 공통화**: 광고가 필요한 playground 목록/데모는 `playground-bottom-ad.js + playground-bottom-ad.css` 공통 규약 사용
- **광고 안전영역 적용**: 광고 배너를 포함하는 경우 핵심 루트는 `var(--playground-ad-safe-space, 0px)`를 반영해 하단 가림 방지
- **CSP/SRI 검토**: 외부 스크립트/CDN을 쓰는 데모는 CSP와 SRI 적용 여부 확인

## 광고 안전영역 규약 (광고 배너 사용 시)

```html
<div
  id="demo-container"
  data-playground-safe-root
  style="height: calc(100vh - var(--playground-ad-safe-space, 0px));"
>
  <!-- demo UI -->
</div>
```

## 태그 예시
- `webgl` - Three.js/WebGL
- `canvas` - Canvas 2D
- `simulation` - 물리/파티클
- `game` - 미니게임/퍼즐
- `experimental` - 실험적 데모

## 현재 Playground 목록
- **Embercraft Fireplace** - Three.js + Cannon.js 기반 실시간 장작불 시뮬레이션
- **네모게임 (NEMO GAME)** - 100% 풀이 가능한 논리 퍼즐
- **PDF OCR Extractor** - 브라우저에서 PDF/이미지 텍스트를 인식하고 주요 데이터를 자동으로 정리하는 도구
- **Local LLM Chat** - 브라우저에서 실행해보는 가벼운 로컬 AI 채팅 playground
- **Focus Timer** - 구글 타이머 스타일의 집중 타이머. 종료 알림과 남은 시간 아이콘 표시 지원
