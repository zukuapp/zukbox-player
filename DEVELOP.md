# ZUKBOX Player 개발 가이드

이 문서는 [Next2D Player](https://github.com/Next2D/Player)를 기반으로 한 [ZUKU 포크](https://github.com/zukuapp/zukbox-player)의 로컬 개발 경로를 설명합니다. 공개 패키지 이름과 내부 import 경계는 `@next2d/*`를 유지합니다. 플랫폼에서의 위치는 [ZUKU 개발자 문서](https://zukuapp.github.io/docs/)에서 확인할 수 있습니다.

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

테스트 하나만 실행할 때는 `npx vitest run packages/webgl/src/Blend/service/BlendAddService.test.ts`처럼 파일 경로를 전달합니다. `build:vite`는 버전 정보를 생성하고 Vite 번들을 빌드합니다. 산출물과 변경된 파일은 커밋 전에 확인해 주세요.

## 패키지와 의존 경계

`package.json`의 npm 워크스페이스는 `packages/*`입니다.

| 영역 | 패키지와 역할 |
| --- | --- |
| 진입점 | `@next2d/player`와 `@next2d/core` |
| 낮은 수준 공통 기능 | `events`, `cache`, `filters`, `geom`, `texture-packer`, `render-queue` |
| 렌더링 | `renderer`, `webgl`, `webgpu` |
| 화면·입출력 | `display`, `text`, `media`, `ui`, `net` |

공통 기능 패키지 간 순환 참조를 피합니다. `@next2d/core`는 다른 하위 패키지가 참조하는 공통 유틸리티가 아니라 상위 진입점입니다. `@next2d/renderer`는 워커에서 WebGL과 WebGPU 백엔드를 사용합니다. 실제 import 관계를 바꿀 때는 각 패키지의 `package.json`과 소스 import를 함께 확인합니다.

기존 소스는 단순 작업을 `class → method → service`, 여러 작업을 조합하는 흐름을 `class → method → usecase → service`로 나눕니다. `service`에서 다른 `service`를 직접 호출하는 방식은 피하고, 조합은 `usecase`에 둡니다. 예시는 `packages/webgl/src/`의 `service/`와 `usecase/`에서 볼 수 있습니다.

## 렌더링 경로

메인 스레드가 디스플레이 트리와 이벤트를 관리하고, 렌더링 명령은 큐를 거쳐 워커로 전달됩니다. 워커는 가능한 환경에서 `OffscreenCanvas`를 사용합니다. WebGPU 사용 여부는 `packages/renderer/src/Command/service/CommandInitializeContextService.ts`의 `useWebGPU` 상수와 브라우저의 `navigator.gpu` 지원 여부에 따라 결정되며, 코드에는 WebGL2 경로도 있습니다.

WebGL과 WebGPU 출력을 비교하려면 이 상수를 확인한 뒤 각각의 브라우저 검사 결과를 비교합니다. Playwright의 프로젝트 이름만 변경해도 소스의 렌더러 선택 상수가 자동으로 바뀌지는 않습니다.

## 브라우저와 성능 검사

E2E 설정은 `e2e/playwright.config.ts`에 있습니다. 브라우저가 설치돼 있고 그래픽 기능을 사용할 수 있는 환경에서 저장소 루트에서 실행합니다. 기존 스냅샷은 환경에 따라 달라질 수 있으므로 차이를 검토한 뒤 갱신합니다.

```bash
npx playwright install chromium
npm run test:e2e:webgl
npm run test:e2e:webgpu
```

특정 파일만 보려면 `npm run test:e2e:webgl -- e2e/tests/sprite.spec.ts`를 사용합니다. 성능 시나리오는 `PERF=1`로 구분되며 `npm run test:e2e:perf:webgl`과 `npm run test:e2e:perf:webgpu` 스크립트가 준비돼 있습니다. 측정값은 장치와 그래픽 드라이버에 영향을 받습니다.

## 배포 경계

루트 패키지는 `@next2d/player`, 하위 워크스페이스도 `@next2d/*` 이름을 사용합니다. `npm run publish:dist`는 배포 패키지를 만드는 유지보수 명령입니다. `.github/workflows/publish.yml`은 `main` 푸시 뒤 린트와 통합 검사를 거쳐 npm 공개 게시를 시도하도록 구성돼 있습니다. 문서 변경을 포함한 `main` 반영 전에 이 워크플로의 실행 결과와 게시 권한을 확인해야 합니다.

일반적인 로컬 검증에는 위의 `lint`, `test`, `build:vite`를 사용합니다. 원본 저작권 고지와 [MIT 라이선스](LICENSE)는 유지합니다.
