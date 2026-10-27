<!-- BEGIN ZUKU OFFICIAL BRAND -->
<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <a href="https://docs.zuzunza.com/">
    <picture>
      <source media="(prefers-color-scheme: dark)"
        srcset="docs/branding/zuku-logo-dark.png">
      <img src="docs/branding/zuku-logo-light.png"
        alt="ZUKU" width="320">
    </picture>
  </a>
</p>
<p align="center">ZUKU - 내가 불러 일으키는 새로운 창작.</p>
<!-- markdownlint-enable MD033 MD041 -->
<!-- END ZUKU OFFICIAL BRAND -->

# ZUKBOX Player

![version](https://img.shields.io/badge/version-v27.26102701-informational)

## 개요

이 저장소는 [Next2D Player](https://github.com/Next2D/Player)의 ZUKU 포크입니다. 디스플레이 트리, 텍스트·미디어, 렌더링 큐, WebGL·WebGPU 렌더러를 npm 워크스페이스로 관리합니다. 라이선스는 [MIT](LICENSE)입니다.

문서: [ZUKU 개발자 문서](https://zukuapp.github.io/docs/) · [개발 가이드](DEVELOP.md)

| 경로 | 내용 |
| --- | --- |
| `src/` | `@next2d/player` 진입점 |
| `packages/` | `@next2d/core`, `display`, `renderer`, `webgl`, `webgpu` 등 하위 패키지 |
| `npm/player/` | 게임 개발용 배포 패키지 `@zuku/player` |
| `e2e/` | Playwright 브라우저 렌더링 검사와 스냅샷 |
| `specs/` | 플레이어 API 사양 문서(영어, 일본어, 중국어) |
| `DEVELOP.md` | 워크스페이스 설치, 검증 명령, 렌더링 구조 |

npm 레지스트리의 `@next2d/*` 패키지는 업스트림 배포판이며, 이 포크를 사용할 때는 `@zuku/player`를 설치합니다.

## 요구 사항

- Node.js 24 (CI 기준)
- npm

## 설치

```bash
git clone https://github.com/zukuapp/zukbox-player.git
cd zukbox-player
npm ci
```

게임 프로젝트에서 배포 패키지를 사용할 때는 다음 명령으로 설치합니다.

```bash
npm install @zuku/player
```

`@zuku/player`의 브라우저 ESM API와 빌드 방법은 [npm/player/README.md](npm/player/README.md)에 있습니다.

## 사용법

Vite 개발 서버를 실행합니다.

```bash
npm run start
```

변경 후에는 다음 명령으로 검증합니다.

```bash
npm run lint
npm test -- --run
npm run build:vite
```

브라우저 스냅샷 검사, 패키지 의존 경계, 렌더러 선택은 [DEVELOP.md](DEVELOP.md)에 설명합니다.

## 관련 프로젝트

- [zukbox](https://github.com/zukuapp/zukbox): 이 플레이어의 로컬 `@next2d/*` 패키지를 참조하는 에디터
- [zukbox-runtime](https://github.com/zukuapp/zukbox-runtime): ZWF 런타임
- [ZUKU 개발자 문서](https://zukuapp.github.io/docs/): 플랫폼 전체 문서

기여 방법은 [조직 공통 가이드](https://github.com/zukuapp/.github/blob/main/CONTRIBUTING.md)에, 취약점 신고 방법은 [보안 정책](SECURITY.md)에 있습니다.

## 변경 이력

[CHANGELOG.md](CHANGELOG.md)에 기록합니다.
