# Playground

Eleventy 사이트의 `/devbyhwang/playground/`에 노출되는 독립형 데모 모음입니다.

## 새 데모 추가하기

1. **디렉터리 생성**
   ```bash
   mkdir -p src/demos/your-demo-name
   ```

2. **`index.html` 작성**
   - `src/demos/_template.html`을 복사해 시작
   - 데모는 사이트 전역 CSS/JS에 의존하지 않도록 구성
   - 데모 내부 리소스는 상대 경로 기반으로 작성
   - `../` 백 링크를 포함해 Playground 목록으로 복귀 가능하게 유지
   - 광고 배너는 `../../../assets/playground-bottom-ad.js`만 포함 (스크립트가 `playground-bottom-ad.css`를 자동 로드)
   - 광고에 UI가 가려지지 않도록 핵심 루트에 `data-playground-safe-root` 부여

3. **`studio.js`에 카드 엔트리 추가** (`src/_data/studio.js`)
   ```js
   {
     title: "Your Demo Name",
     role: "Playground",
     status: "Live",
     blurb: "한 줄 설명",
     links: [{ label: "Launch", href: "/devbyhwang/playground/your-demo-name/" }],
     tags: ["canvas", "game"],
     type: "demo",
     preview: "/assets/your-demo-preview.png",
   }
   ```

4. **로컬 확인**
   ```bash
   npm run dev
   # http://localhost:8080/devbyhwang/playground/your-demo-name/
   ```

## 요구사항
- **반응형**: 모바일/데스크톱 모두 동작
- **독립형**: 데모 단독으로 실행 가능
- **PATH_PREFIX 호환**: 절대 경로 하드코딩 지양, 상대 경로 우선
- **백 네비게이션**: `../` 링크 유지
- **비밀키 금지**: 데모 HTML/JS에 API 키 하드코딩 금지
- **광고 UI 공통화**: playground 목록/데모 모두 `playground-bottom-ad.js + playground-bottom-ad.css` 공통 규약 사용
- **광고 안전영역 적용**: 핵심 루트는 `var(--playground-ad-safe-space, 0px)`를 반영해 하단 가림 방지

## 광고 안전영역 규약

```html
<div
  id="demo-container"
  data-playground-safe-root
  style="height: calc(100vh - var(--playground-ad-safe-space, 0px));"
>
  <!-- demo UI -->
</div>
```

## LLM 연동 시 권장 아키텍처
- 정적 데모(`src/demos/*`)는 프록시 서버 엔드포인트만 호출
- API 키는 프록시 환경변수/시크릿에만 저장
- 프록시에 CORS Origin 제한 + Turnstile 검증 적용
- rate limit은 Durable Object 같은 원자적 카운터 사용
- 개인 API 키 입력 UI는 기본 제외(필요 시 별도 정책과 경고 문구 필수)

## 태그 예시
- `webgl` - Three.js/WebGL
- `canvas` - Canvas 2D
- `simulation` - 물리/파티클
- `game` - 미니게임/퍼즐
- `experimental` - 실험적 데모

## 현재 Playground 목록
- **Embercraft Fireplace** - Three.js + Cannon.js 기반 실시간 장작불 시뮬레이션
- **네모게임 (NEMO GAME)** - 100% 풀이 가능한 논리 퍼즐
