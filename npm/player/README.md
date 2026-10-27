<picture><source media="(prefers-color-scheme: dark)" srcset="assets/zuku-logo-dark.png"><img src="assets/zuku-logo-light.png" alt="ZUKU official logo" width="300"></picture>

# @zuku/player

ZUKU - 내가 불러 일으키는 새로운 창작.

![version](https://img.shields.io/badge/version-v27.26102701-informational)

## 개요

`@zuku/player`는 ZUKU / ZUKBOX 게임 프로젝트용 Next2D 브라우저 플레이어 배포 패키지입니다. 브라우저 ESM 번들이며 렌더러 워커와 unzip 워커를 포함합니다.

| 항목 | 버전 |
| --- | --- |
| 기반 Next2D Player | 3.11.0 |
| npm 패키지 `@zuku/player` | 0.1.2 |

## 요구 사항

- DOM과 Worker를 제공하는 브라우저
- WebGPU 또는 WebGL2
- TypeScript 6 이상, `moduleResolution: Bundler`, DOM 타입. WebGPU 타입 선언은 TypeScript 6의 DOM 라이브러리에 포함됩니다.

이 패키지는 브라우저 전용입니다. 서버에서 렌더러를 시작하지 않습니다. Node.js 프로젝트는 타입만 사용하거나 브라우저 번들 안에서 import합니다.

## 설치

```sh
npm install @zuku/player
```

## 사용법

```ts
import next2d from '@zuku/player';
const root = await next2d.createRootMovieClip(640, 400, 30);
const shape = new next2d.display.Shape();
shape.graphics.beginFill(0x00bcf2).drawRect(0, 0, 80, 80).endFill();
root.addChild(shape);
```

기본 내보내기는 Next2D 인스턴스입니다. `display`, `events`, `filters`, `geom`, `media`, `net`, `text`, `ui` API를 제공합니다. `Next2D`와 `next2d`는 이름 있는 내보내기로도 가져옵니다.

## 설정

호스트 페이지의 CSP에 다음 지시문이 필요합니다.

| 지시문 | 값 | 용도 |
| --- | --- | --- |
| `worker-src` | `'self' blob: data:` | 렌더러와 unzip 워커 실행 |
| `style-src` | `'self' 'unsafe-inline'` | 플레이어의 동적 스타일 |

## 그래픽 복구

1. WebGPU adapter와 device 획득 대기 시간에는 상한이 있습니다.
2. WebGPU 초기화 실패나 device 손실이 발생하면 WebGL2로 전환합니다.
3. 스테이지 캔버스가 이미 WebGPU에 연결된 경우 캔버스를 교체하고 크기를 복원합니다.
4. 교체된 렌더러의 늦은 결과와 오류는 현재 렌더러를 덮어쓰지 않습니다.
5. 캔버스 교체는 페이지당 최대 두 번입니다.
6. 두 백엔드가 모두 실패하면 `next2d-renderer`를 `state: "failed"`로 보고하고, 대기 중인 렌더링·캡처 버퍼를 해제합니다.

## 소스에서 빌드

저장소 루트에서 다음 명령을 실행합니다.

```sh
npm ci
node npm/player/build.mjs
```

## 라이선스

원본 권리 표시는 `THIRD_PARTY_NOTICES.md`와 `LICENSE`에 있습니다.

## English

`@zuku/player` is the ZUKU / ZUKBOX distribution of the maintained Next2D browser player. It is a browser ESM bundle that includes the renderer and unzip workers.

- Requirements: a browser with DOM and Workers, WebGPU or WebGL2, TypeScript 6 or later with `moduleResolution: Bundler` and DOM types.
- Node.js consumers use the types or import the package in a browser bundle.
- CSP: `worker-src 'self' blob: data:` and `style-src 'self' 'unsafe-inline'`.
- WebGPU acquisition is bounded. Failed initialization or a lost device falls back to WebGL2. When the stage canvas is already bound to WebGPU, the player replaces it and restores its size. Late results and errors from a replaced renderer do not overwrite the current renderer. Recovery is limited to two canvas replacements per page. If both backends fail, the player reports `next2d-renderer` with `state: "failed"` and releases waiting render and capture buffers.
