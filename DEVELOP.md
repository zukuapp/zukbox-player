# ZUKBOX Player 개발 가이드

[ZUKU 포크](https://github.com/zukuapp/zukbox-player)는 [Next2D Player](https://github.com/Next2D/Player)를 기반으로 합니다. 워크스페이스 패키지 이름과 내부 import 경계는 `@next2d/*`를 유지합니다. 플랫폼 전체 구성은 [ZUKU 개발자 문서](https://zukuapp.github.io/docs/)에 있습니다.

## 준비와 실행

CI는 Node.js 24와 `npm ci`를 사용합니다. 저장소 루트에서 실행합니다.

```bash
git clone https://github.com/zukuapp/zukbox-player.git
cd zukbox-player
npm ci
npm run start
```

`start`는 Vite 개발 서버를 띄웁니다. 변경을 검증할 때는 다음 스크립트를 사용합니다.

```bash
npm run lint
npm test -- --run
npm run build:vite
```

테스트 하나만 실행할 때는 `npx vitest run packages/webgl/src/Blend/service/BlendAddService.test.ts`처럼 파일 경로를 전달합니다. `build:vite`는 버전 정보를 생성하고 Vite 번들을 빌드합니다. 커밋 전에 산출물과 변경된 파일을 확인합니다.

## 패키지와 의존 경계

`package.json`의 npm 워크스페이스는 `packages/*`입니다.

| 영역 | 패키지와 역할 |
| --- | --- |
| 진입점 | `@next2d/player`와 `@next2d/core` |
| 낮은 수준 공통 기능 | `events`, `cache`, `filters`, `geom`, `texture-packer`, `render-queue` |
| 렌더링 | `renderer`, `webgl`, `webgpu` |
| 화면·입출력 | `display`, `text`, `media`, `ui`, `net` |

공통 기능 패키지 간 순환 참조를 피합니다. `@next2d/core`는 다른 하위 패키지가 참조하는 공통 유틸리티가 아니라 상위 진입점입니다. `@next2d/renderer`는 워커에서 WebGL과 WebGPU 백엔드를 사용합니다. 실제 import 관계를 바꿀 때는 각 패키지의 `package.json`과 소스 import를 함께 확인합니다.

기존 소스는 단순 작업을 `class → method → service`, 여러 작업을 조합하는 흐름을 `class → method → usecase → service`로 나눕니다. `service`에서 다른 `service`를 직접 호출하지 않고, 조합은 `usecase`에 둡니다. 예시는 `packages/webgl/src/`의 `service/`와 `usecase/`에 있습니다.

## 렌더링 경로

메인 스레드가 디스플레이 트리와 이벤트를 관리하고, 렌더링 명령은 큐를 거쳐 워커로 전달됩니다. 워커는 가능한 환경에서 `OffscreenCanvas`를 사용합니다. WebGPU 사용 여부는 `packages/renderer/src/Command/service/CommandInitializeContextService.ts`의 `useWebGPU` 상수와 브라우저의 `navigator.gpu` 지원 여부로 결정합니다. WebGPU 초기화나 표시에 실패하면 WebGL2 경로로 전환합니다.

WebGL과 WebGPU 출력을 비교하려면 이 상수를 확인한 뒤 각각의 브라우저 검사 결과를 비교합니다. Playwright의 프로젝트 이름만 변경해도 소스의 렌더러 선택 상수가 자동으로 바뀌지는 않습니다.

## 브라우저와 성능 검사

E2E 설정은 `e2e/playwright.config.ts`에 있습니다. 브라우저와 그래픽 기능이 있는 환경의 저장소 루트에서 실행합니다. 스냅샷은 브라우저와 그래픽 드라이버의 영향을 받으므로 차이를 검토한 뒤 갱신합니다.

```bash
npx playwright install chromium
npm run test:e2e:webgl
npm run test:e2e:webgpu
```

특정 파일만 보려면 `npm run test:e2e:webgl -- e2e/tests/sprite.spec.ts`를 사용합니다. 성능 시나리오는 `PERF=1`로 구분하며 `npm run test:e2e:perf:webgl`과 `npm run test:e2e:perf:webgpu`로 실행합니다. 측정값은 장치와 그래픽 드라이버의 영향을 받습니다.

## 배포 경계

루트 패키지는 `@next2d/player`, 하위 워크스페이스는 `@next2d/*` 이름을 사용합니다. 이 포크는 업스트림 `@next2d/*` 네임스페이스로 게시하지 않습니다. `npm run publish:dist`는 업스트림 배포 산출물을 만드는 유지보수 명령입니다.

게임 개발용 배포 패키지는 `npm/player/`의 `@zuku/player`입니다. `.github/workflows/publish.yml`은 다음 경우에 실행합니다.

| 트리거 | 조건 |
| --- | --- |
| `push` | `main` 브랜치이고 `npm/player/**`, `packages/renderer/src/Command/service/CommandInitializeContext*`, `.github/workflows/publish.yml` 중 하나가 바뀐 경우 |
| `pull_request` | 위와 같은 경로가 바뀐 경우 |
| `workflow_dispatch` | 수동 실행 |

워크플로는 다음 순서로 진행합니다.

1. `lint.yml`과 `integration.yml`을 실행합니다.
2. 렌더러 복구 회귀 테스트를 실행합니다.
3. `node npm/player/build.mjs`로 패키지를 빌드합니다.
4. `node npm/player/check-packed.mjs`로 패키지 내용을 검사합니다.
5. `npm pack ./npm/player`로 아카이브를 만듭니다.

워크플로는 npm에 게시하지 않습니다. 릴리스 담당자가 검증된 `@zuku/player` 아카이브를 직접 게시합니다.

일반적인 로컬 검증에는 위의 `lint`, `test`, `build:vite`를 사용합니다. 원본 저작권 고지와 [MIT 라이선스](LICENSE)는 유지합니다.
