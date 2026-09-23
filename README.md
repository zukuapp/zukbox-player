# ZUKBOX Player

이 저장소는 [Next2D Player](https://github.com/Next2D/Player)의 ZUKU 포크입니다. 디스플레이 트리, 텍스트·미디어, 렌더링 큐, WebGL·WebGPU 렌더러를 npm 워크스페이스로 관리합니다. 원본 저작권과 [MIT 라이선스](LICENSE)를 유지합니다.

<a href="https://zukuapp.github.io/docs/"><img src="https://raw.githubusercontent.com/zukuapp/.github/main/profile/assets/developer-hero.png" alt="Trecillo × ZUKU 개발자 문서" width="760"></a>

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
