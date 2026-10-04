<picture><source media="(prefers-color-scheme: dark)" srcset="assets/zuku-logo-dark.png"><img src="assets/zuku-logo-light.png" alt="ZUKU official logo" width="300"></picture>

# @zuku/player

ZUKU - 내가 불러 일으키는 새로운 창작.

Maintained Next2D browser player for ZUKU / ZUKBOX game projects. This is a bundled browser ESM distribution with its renderer and unzip workers included. Original Next2D code, MIT attribution and source package names are preserved. It does not publish or replace the upstream `@next2d/*` packages.

```sh
npm install @zuku/player
```

```ts
import next2d from '@zuku/player';
const root = await next2d.createRootMovieClip(640, 400, 30);
const shape = new next2d.display.Shape();
shape.graphics.beginFill(0x00bcf2).drawRect(0, 0, 80, 80).endFill();
root.addChild(shape);
```

브라우저 전용입니다. 서버에서 렌더러를 시작하지 마세요. Next2D 인스턴스 및 기존 display / events / filters / geom / media / net / text / ui API를 제공합니다. `Next2D`, `next2d`도 이름으로 가져올 수 있습니다. 3.11.0은 기반 플레이어의 버전이며 0.1.1은 이 배포 패키지의 버전입니다. 기존 게임 파일의 지원 범위를 확대했다고 주장하지 않습니다.

Worker 실행을 위해 호스트 CSP에 `worker-src 'self' blob: data:`를 지정하세요. 플레이어의 동적 스타일은 `style-src 'self' 'unsafe-inline'`이 필요합니다. JavaScript `unsafe-eval` 권한은 요구하지 않습니다. WebGPU adapter/device를 사용할 수 없으면 WebGL2로 전환합니다. 실제 브라우저와 장치의 그래픽 지원을 확인해야 합니다. This package needs a DOM, Workers and a supported graphics backend; Node.js consumers should use its types or import it in their browser bundle. TypeScript 6 or later, `moduleResolution: Bundler` and DOM types are required; WebGPU declarations are included in TypeScript 6's DOM library.

소스에서 다시 빌드할 때 저장소 루트에서 `npm ci` 후 `node npm/player/build.mjs`를 실행합니다. 공식 로고는 승인된 원본 PNG 파일입니다. THIRD_PARTY_NOTICES.md와 LICENSE에 원본 권리 표시를 제공합니다.
