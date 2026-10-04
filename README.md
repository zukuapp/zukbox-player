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

이 저장소는 [Next2D Player](https://github.com/Next2D/Player)의 ZUKU 포크입니다. 디스플레이 트리, 텍스트·미디어, 렌더링 큐, WebGL·WebGPU 렌더러를 npm 워크스페이스로 관리합니다. 원본 저작권과 [MIT 라이선스](LICENSE)를 유지합니다.

**문서 입구:** [ZUKU 개발자 문서](https://zukuapp.github.io/docs/) · [이 저장소의 개발 가이드](DEVELOP.md)

## 무엇이 들어 있나요?

| 경로 | 내용 |
| --- | --- |
| `src/` | `@next2d/player` 진입점 |
| `packages/` | `@next2d/core`, `display`, `renderer`, `webgl`, `webgpu` 등 하위 패키지 |
| `e2e/` | Playwright 브라우저 렌더링 검사와 스냅샷 |
| `DEVELOP.md` | 워크스페이스 설치, 검증 명령, 렌더링 구조 |

패키지 이름은 `@next2d/player`와 `@next2d/*`로 유지됩니다. `@zuku/*` 배포 설정은 없습니다. 배포를 포함한 저장소 설정은 [개발 가이드](DEVELOP.md#배포-경계)에 설명합니다.

## 빠른 시작

CI와 같은 Node.js 24 환경을 권장합니다.

```bash
git clone https://github.com/zukuapp/zukbox-player.git
cd zukbox-player
npm ci
npm run start
```

변경 후에는 저장소에 정의된 명령으로 확인합니다.

```bash
npm run lint
npm test -- --run
npm run build:vite
```

브라우저 스냅샷 검사, 패키지 의존 경계, 렌더러 선택은 [DEVELOP.md](DEVELOP.md)를 참고해 주세요.

## 연결되는 프로젝트

- [zukbox](https://github.com/zukuapp/zukbox): 이 플레이어의 로컬 `@next2d/*` 패키지를 참조하는 에디터
- [zukbox-runtime](https://github.com/zukuapp/zukbox-runtime): ZWF 런타임
- [ZUKU 개발자 문서](https://zukuapp.github.io/docs/): 플랫폼 전체 문서

기여 방법은 [조직 공통 가이드](https://github.com/zukuapp/.github/blob/main/CONTRIBUTING.md), 취약점 신고 방법은 [보안 정책](SECURITY.md)을 확인해 주세요.

## ZUKU game-development npm distribution

The maintained fork is available to game developers as `@zuku/player`. Install with `npm install @zuku/player` and see [the browser ESM API and build guide](npm/player/README.md). The distribution includes renderer workers and TypeScript 6 declarations without local workspace dependencies. The source package names, upstream MIT copyright notices, and original Next2D APIs are preserved. This fork does not publish the upstream `@next2d/*` namespace.
