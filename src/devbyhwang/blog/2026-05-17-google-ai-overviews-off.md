---
layout: layouts/devbyhwang-post.njk
title: "구글 AI 개요 끄기: AI 답변 없이 검색 결과만 보는 법"
date: 2026-05-17
category: info
---

## 결론 먼저

구글 AI 개요, 즉 AI Overviews는 2026년 5월 기준으로 **완전히 끄는 설정이 없습니다.**
Google 공식 도움말도 AI Overviews를 지식 패널 같은 핵심 검색 기능으로 설명하며, 기능 자체를 끌 수는 없다고 안내합니다.

대신 우회 방법은 있습니다.
검색 후 **Web 필터**를 누르거나, 검색 URL 끝에 `&udm=14`를 붙이면 AI 답변 없이 링크 중심 결과를 볼 수 있습니다.

가장 빠른 방법은 이 주소 형식을 쓰는 것입니다.

```text
https://www.google.com/search?q=검색어&udm=14
```

예를 들어 `아이폰 사진 용량 줄이기`를 AI 개요 없이 검색하려면 이렇게 입력합니다.

```text
https://www.google.com/search?q=아이폰+사진+용량+줄이기&udm=14
```

## 빠른 선택표

| 상황 | 추천 방법 | 이유 |
| --- | --- | --- |
| 한 번만 AI 답변 없이 보고 싶다 | 검색 결과에서 `Web` 필터 선택 | 가장 공식적이고 간단하다 |
| 매번 링크 중심 결과를 보고 싶다 | `&udm=14`가 붙은 검색 URL 사용 | AI 개요, 지식 패널 등 부가 요소를 줄일 수 있다 |
| PC 크롬 주소창 검색을 바꾸고 싶다 | 맞춤 검색엔진에 `&udm=14` URL 등록 | 주소창 검색부터 Web 결과로 열 수 있다 |
| 모바일에서 가끔만 쓰고 싶다 | 검색 후 Web 탭 선택 또는 북마크 사용 | 모바일 브라우저는 기본 검색엔진 커스텀이 제한적이다 |
| Search Labs에서 AI 기능을 켰다 | Labs의 `AI in Search`를 끈다 | 실험 기능은 줄일 수 있지만 기본 AI 개요를 완전히 끄는 것은 아니다 |

핵심은 이렇습니다.

- **완전 끄기:** 공식 설정 없음
- **일회성 우회:** Web 필터
- **반복 사용:** `&udm=14` URL 또는 맞춤 검색엔진
- **실험 기능 줄이기:** Search Labs의 `AI in Search` 끄기

## 구글 AI 개요는 왜 바로 꺼지지 않을까?

Google은 AI Overviews를 검색 결과 기능 중 하나로 취급합니다.
공식 도움말에서는 AI Overviews가 검색어에 따라 핵심 정보를 AI로 요약하고, 더 살펴볼 수 있는 링크를 함께 보여주는 기능이라고 설명합니다.

문제는 사용자가 항상 이 요약을 원하는 것은 아니라는 점입니다.

- 원문 링크를 먼저 보고 싶다.
- AI 답변이 길어서 검색 결과가 밀린다.
- 요약보다 여러 출처를 직접 비교하고 싶다.
- AI 답변이 틀릴까 봐 바로 신뢰하기 어렵다.
- 예전처럼 파란 링크 목록만 보고 싶다.

Google 도움말도 AI 응답에는 실수가 있을 수 있고, 중요한 정보는 여러 곳에서 확인하라고 안내합니다.
그래서 완전히 끄는 설정은 없더라도, 링크 중심 검색을 따로 보는 방법을 알아두면 유용합니다.

## 방법 1. 검색 결과에서 Web 필터 누르기

가장 안전한 방법은 Google 검색 결과에서 `Web` 필터를 선택하는 것입니다.
Google 공식 도움말에 따르면 Web 필터는 AI Overviews 같은 기능 없이 텍스트 기반 링크만 표시합니다.

사용 방법은 간단합니다.

1. Google에서 평소처럼 검색합니다.
2. 검색창 아래의 탭에서 `Web` 또는 `웹` 필터를 찾습니다.
3. 보이지 않으면 `더보기` 안에 있는지 확인합니다.
4. Web 필터를 누르면 링크 중심 결과로 바뀝니다.

이 방법의 장점은 공식 기능이라는 점입니다.
확장 프로그램이나 외부 사이트를 쓰지 않아도 됩니다.

단점도 있습니다.
매번 검색한 뒤 Web 필터를 눌러야 합니다.
자주 쓰기에는 번거롭습니다.

## 방법 2. 주소 끝에 `&udm=14` 붙이기

`&udm=14`는 Google 검색 결과를 Web 필터에 가까운 링크 중심 화면으로 여는 URL 파라미터입니다.
2026년 5월 기준 해외 IT 매체와 커뮤니티에서 다시 많이 공유되고 있는 우회 방법입니다.

기본 형식은 이렇습니다.

```text
https://www.google.com/search?q=검색어&udm=14
```

검색어에 공백이 있다면 공백 대신 `+`를 넣으면 됩니다.

```text
https://www.google.com/search?q=구글+AI+개요+끄기&udm=14
```

이 주소를 브라우저 주소창에 입력하면 AI 개요가 없는 링크 중심 검색 결과를 볼 수 있습니다.

> `udm=14`는 “AI Overviews를 계정 설정에서 꺼버리는 기능”이 아닙니다.
> 그 검색 요청을 Web 모드로 여는 우회 방법에 가깝습니다.

## 방법 3. 크롬 PC 주소창 검색을 Web 모드로 바꾸기

PC에서 Chrome을 쓴다면 맞춤 검색엔진을 등록해서 주소창 검색에 `&udm=14`를 붙일 수 있습니다.

Chrome에서 시도할 수 있는 설정은 다음과 같습니다.

1. 주소창에 아래 주소를 입력합니다.

```text
chrome://settings/searchEngines
```

2. `사이트 검색` 또는 `검색엔진 및 사이트 검색 관리` 영역에서 새 검색엔진을 추가합니다.
3. 이름은 알아보기 쉽게 입력합니다.

```text
Google Web
```

4. 바로가기에는 원하는 짧은 키워드를 넣습니다.

```text
@web
```

5. URL 입력칸에는 아래 값을 넣습니다.

```text
https://www.google.com/search?q=%s&udm=14
```

6. 저장한 뒤 해당 검색엔진을 기본값으로 지정할 수 있는지 확인합니다.

Chrome 버전이나 관리 정책에 따라 기본값 지정 메뉴가 다르게 보일 수 있습니다.
기본값으로 지정이 안 된다면 주소창에 `@web 검색어` 형태로 쓰는 방식도 가능합니다.

예시:

```text
@web 윈도우 11 광고 끄기
```

## 방법 4. Edge에서도 비슷하게 설정하기

Microsoft Edge도 Chromium 기반이라 비슷한 방식으로 설정할 수 있습니다.

1. 주소창에 아래 주소를 입력합니다.

```text
edge://settings/searchEngines
```

2. 검색엔진 관리 화면에서 새 검색엔진을 추가합니다.
3. URL에는 아래 값을 넣습니다.

```text
https://www.google.com/search?q=%s&udm=14
```

4. 저장 후 기본 검색엔진 또는 바로가기 검색으로 사용할 수 있는지 확인합니다.

회사나 학교 계정으로 관리되는 브라우저라면 이 설정이 막혀 있을 수 있습니다.
그 경우에는 Web 필터를 직접 누르는 방식이 가장 무난합니다.

## 방법 5. 모바일에서는 어떻게 하나?

모바일은 PC보다 제한이 많습니다.
Chrome이나 Safari 모바일에서는 데스크톱처럼 검색엔진 URL을 자유롭게 바꾸기 어렵습니다.

현실적인 방법은 세 가지입니다.

| 방법 | 장점 | 단점 |
| --- | --- | --- |
| 검색 후 Web 필터 누르기 | 공식 기능이고 안전하다 | 매번 눌러야 한다 |
| `udm=14` 검색 URL을 북마크하기 | 자주 쓰는 검색에 편하다 | 검색어를 직접 바꿔야 한다 |
| 커스텀 검색을 지원하는 브라우저 사용 | 반복 사용에 편하다 | 브라우저를 바꿔야 할 수 있다 |

모바일에서 북마크로 쓰고 싶다면 아래 주소를 저장해두면 됩니다.

```text
https://www.google.com/search?q=%s&udm=14
```

다만 모바일 브라우저는 `%s`를 자동으로 검색어로 바꿔주지 않는 경우가 많습니다.
그럴 때는 아래처럼 검색어를 직접 넣은 주소를 쓰세요.

```text
https://www.google.com/search?q=검색어&udm=14
```

## Search Labs를 끄면 AI 개요도 꺼질까?

혼동하기 쉬운 부분입니다.

Google 도움말에는 Search Labs의 `AI in Search` 실험 기능을 끄는 방법이 나옵니다.
하지만 이것은 실험 기능 참여를 끄는 것이지, 모든 Google 검색에서 AI Overviews를 완전히 제거하는 스위치라고 보면 안 됩니다.

정리하면 이렇습니다.

| 항목 | 의미 |
| --- | --- |
| Search Labs `AI in Search` 끄기 | 실험 기능 참여를 줄이는 설정 |
| AI Overviews 완전 비활성화 | 공식적으로 제공되지 않음 |
| Web 필터 | 해당 검색 결과를 링크 중심으로 보기 |
| `&udm=14` | Web 모드에 가깝게 여는 URL 우회 |

따라서 “Labs를 껐는데도 AI 개요가 보인다”면 이상한 일이 아닙니다.
기본 검색 기능으로 제공되는 AI Overviews와 Labs 실험 기능은 구분해서 봐야 합니다.

## `-ai`를 검색어에 붙이는 방법은 추천하지 않는 이유

일부 글에서는 검색어 뒤에 `-ai`를 붙이라고 설명합니다.
예를 들면 이렇게 검색하는 방식입니다.

```text
구글 검색 설정 -ai
```

이 방식은 AI 개요가 줄어드는 것처럼 보일 수 있지만 부작용이 있습니다.
Google 검색에서 `-단어`는 그 단어가 들어간 결과를 제외하라는 의미로 쓰일 수 있습니다.

즉, `-ai`를 붙이면 AI 개요만 줄이는 것이 아니라, 본문이나 제목에 `AI`가 들어간 정상적인 검색 결과까지 빠질 수 있습니다.
AI 관련 내용을 검색할 때는 특히 결과가 왜곡됩니다.

그래서 링크 중심 검색이 목적이라면 `-ai`보다 Web 필터나 `&udm=14`를 쓰는 편이 낫습니다.

## 확장 프로그램을 써도 될까?

확장 프로그램으로 AI 개요 영역을 숨기는 방법도 있습니다.
하지만 가장 먼저 추천하지는 않습니다.

이유는 간단합니다.

- 검색 결과 페이지 구조가 바뀌면 확장 프로그램이 깨질 수 있다.
- 확장 프로그램 권한을 확인해야 한다.
- 회사나 학교 PC에서는 설치가 제한될 수 있다.
- 단순히 숨기는 것이라 실제 Google 기능을 끄는 것은 아니다.

확장 프로그램을 쓴다면 최소한 아래를 확인하세요.

- 개발자가 신뢰할 만한가
- 최근 업데이트가 있는가
- 검색 기록이나 모든 사이트 데이터 접근 권한을 요구하는가
- 사용자가 많은가
- 제거가 쉬운가

대부분의 사용자에게는 Web 필터나 `udm=14` 방식이 더 단순합니다.

## 안 될 때 확인할 것

| 증상 | 확인할 것 |
| --- | --- |
| Web 탭이 안 보인다 | `더보기` 메뉴 안에 있는지 확인 |
| `&udm=14`를 붙였는데 일반 결과가 나온다 | URL에서 `&udm=14`가 검색어 일부로 들어가지 않았는지 확인 |
| 주소창 기본 검색 설정이 안 된다 | 브라우저 버전, 회사/학교 관리 정책 확인 |
| 모바일에서 기본 검색을 못 바꾼다 | 북마크 또는 Web 필터 방식으로 대체 |
| Labs를 껐는데 AI 개요가 보인다 | Labs 설정은 완전 비활성화 스위치가 아님 |
| AI 관련 검색 결과가 이상하게 빠진다 | `-ai` 같은 제외 검색어를 쓰지 않았는지 확인 |

## 바로 복사해서 쓰는 URL 템플릿

일회성으로 쓰려면 아래 템플릿을 복사하세요.

```text
https://www.google.com/search?q=검색어&udm=14
```

검색어가 여러 단어라면 공백을 `+`로 바꿉니다.

```text
https://www.google.com/search?q=검색어+두번째단어&udm=14
```

Chrome이나 Edge 맞춤 검색엔진에는 이 값을 넣습니다.

```text
https://www.google.com/search?q=%s&udm=14
```

## 최종 정리

구글 AI 개요를 완전히 끄는 공식 설정은 없습니다.
하지만 AI 답변 없이 링크 중심 결과를 보고 싶다면 방법은 있습니다.

1. 가끔만 필요하면 검색 결과에서 `Web` 필터를 누른다.
2. 자주 필요하면 `https://www.google.com/search?q=검색어&udm=14` 형식을 쓴다.
3. PC에서는 Chrome이나 Edge 맞춤 검색엔진에 `https://www.google.com/search?q=%s&udm=14`를 등록한다.
4. 모바일에서는 Web 필터나 북마크를 쓴다.
5. `-ai` 방식은 정상 검색 결과까지 제외할 수 있어 조심한다.

작성일 기준은 2026년 5월 17일입니다.
Google 검색 UI와 AI 기능 제공 방식은 바뀔 수 있으니, 메뉴 위치가 달라졌다면 Web 필터와 `udm=14` 동작 여부를 먼저 확인하세요.

## 참고 자료

- [Google Search Help - Find information in faster & easier ways with AI Overviews](https://support.google.com/websearch/answer/14901683)
- [Google AI Overviews 공식 소개](https://search.google/intl/en-GB/ways-to-search/ai-overviews/)
- [Google AI in Search 공식 소개](https://search.google/ai-in-search/)
- [Android Central - Google Search Web mode and udm=14](https://www.androidcentral.com/apps-software/this-simple-google-search-trick-removes-all-the-ai-bloat)
- [Tom's Guide - Google users are quietly using &udm=14](https://www.tomsguide.com/ai/google-users-are-quietly-using-and-udm-14-heres-why)

<br />
<div align="center">
  <div style="display: inline-block; border: 1px solid #555; border-radius: 4px; padding: 4px 10px; font-size: 0.8em; color: #555;">
    본 콘텐츠는 AI의 도움을 받아 작성되었습니다.
  </div>
</div>
