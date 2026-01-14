---
layout: layouts/post.njk
title: "Devlog #12 - 바다 셰이더와 빌드 안정화"
category: devlog
readingTime: 4 min
excerpt: "HDRP 물결 셰이더를 가볍게 만들고, 커서 잠금 버그를 잡은 기록."
---
이번 주 목표는 **Starless Harbor**의 해상 표현을 가볍게 만드는 것이었다. 모바일 빌드에서 프레임이 흔들리던 원인은 HDRP의 `Planar Reflection Probe`가 항상 켜져 있었기 때문. 대신 단순 노멀맵과 스크린 스페이스 페이크를 섞어 픽셀 비용을 38% 절약했다.

- 포스트 프로세싱: Bloom을 절반으로 낮추고 컬러 커브만 유지
- 입력 버그: 커서 잠금 상태에서 UI가 먹통 되던 문제를 `InputSystemUIInputModule` 설정으로 해결
- 마일스톤: 다음 스프린트에서 밤안개 VFX와 세이브 슬롯 UI까지 묶어 QA 진행 예정

> 기록: 금요일 새벽 빌드에서 FPS가 48 → 63으로 올랐다. 얕은 바다 표현은 여전히 어색해 임시 텍스처를 교체할 예정.
