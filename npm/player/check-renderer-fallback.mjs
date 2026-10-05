// Real-browser renderer fallback check for the built bundle (npm/player/dist/player.js).
// Injects WebGPU faults into the inline renderer worker and asserts every failure ends on a
// working WebGL2 renderer (pixels on the committed stage frame + worker capture), or - when no
// backend exists at all - on an explicit failure that never hangs the player.
//
//   node npm/player/check-renderer-fallback.mjs                    # launches Playwright Chromium
//   CHROME_CDP_URL=http://127.0.0.1:9222 node npm/player/check-renderer-fallback.mjs
//   CHROME_ARGS="--enable-unsafe-webgpu ..." node npm/player/check-renderer-fallback.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const here = new URL('.', import.meta.url).pathname;
const bundle = resolve(process.env.PLAYER_DIST || resolve(here, 'dist/player.js'));
const faults = readFileSync(resolve(here, 'renderer-fallback-faults.js'), 'utf8');
const MODES = (process.env.MODES || 'none,null-adapter,adapter-hung,device-reject,device-hung,getcontext-null,preferred-format-throws,configure-throws,configure-throws-real,ctor-throws,shader-invalid,device-lost-init,device-lost-after,no-backend').split(',');
const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#f0f}#stage{width:320px;height:240px}</style><div id="stage"></div>
<script type="module">import player from '/player.js';
window.ready=(async()=>{const root=await player.createRootMovieClip(320,240,30,{tagId:'stage',bgColor:'#ffffff'});
const shape=new player.display.Shape();shape.graphics.beginFill(0x00bcf2).drawRect(0,0,120,120).endFill();shape.x=100;shape.y=60;root.addChild(shape);window.game={player,shape};})();</script>`;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
  if (path === '/player.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(bundle)); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = process.env.CHROME_CDP_URL
  ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
  : await chromium.launch({ chromiumSandbox: true, executablePath: process.env.CHROME_PATH || undefined, args: (process.env.CHROME_ARGS || '--use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean) });
const isColor = (p, [r, g, b]) => p && Math.abs(p[0] - r) < 40 && Math.abs(p[1] - g) < 40 && Math.abs(p[2] - b) < 40 && p[3] > 200;
const frame = (tab) => tab.evaluate(() => { const src = document.querySelector('#stage canvas'); const k = document.createElement('canvas'); k.width = src.width; k.height = src.height; const x = k.getContext('2d'); x.drawImage(src, 0, 0); return [...x.getImageData(src.width >> 1, src.height >> 1, 1, 1).data]; });
const capture = (tab) => tab.evaluate(async () => { try { const c = await Promise.race([window.game.player.captureToCanvas(window.game.shape), new Promise((_, j) => setTimeout(() => j(new Error('capture hung')), 4000))]); return [...c.getContext('2d').getImageData(110, 70, 1, 1).data]; } catch (e) { return String(e.message); } });
const results = []; let failed = 0;
try {
  for (const mode of MODES) {
    const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
    await context.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await context.addInitScript({ content: `window.__FAULT_MODE__=${JSON.stringify(mode)};\n${faults}` });
    const tab = await context.newPage(); const pageErrors = [];
    tab.on('pageerror', (e) => pageErrors.push(e.message));
    const row = { mode };
    try {
      await tab.goto(origin);
      await tab.evaluate(() => window.ready);
      await tab.waitForTimeout(mode === 'device-lost-after' ? 5000 : 2500);
      await tab.evaluate(() => window.game.shape.graphics.clear().beginFill(0xffb500).drawRect(0, 0, 120, 120).endFill());
      await tab.waitForTimeout(800);
      const probe = await tab.evaluate(() => window.__probe);
      if (mode === 'adapter-hung' || mode === 'device-hung') {
        assert(probe.some(p => p.t === 'inject' && p.what === (mode === 'adapter-hung' ? 'requestAdapter never settles' : 'requestDevice never settles')), 'hung acquisition fault must execute');
      }
      const ready = probe.filter((p) => p.t === 'main-recv' && p.message === 'rendererReady').map((p) => p.backend);
      Object.assign(row, { backend: ready.at(-1) || null, frame: await frame(tab), capture: await capture(tab), pageErrors });
      if (mode === 'no-backend') {
        assert.equal(row.backend, null);
        assert(probe.some((p) => p.t === 'main-recv' && p.message === 'rendererInitFailed'), 'explicit init failure');
        assert(Array.isArray(row.capture), `capture must answer instead of hanging: ${row.capture}`);
      } else if (mode === 'none' && row.backend === 'webgpu') {
        assert(isColor(row.capture, [255, 181, 0]), `webgpu capture ${row.capture}`);
      } else {
        assert.equal(row.backend, 'webgl2', 'ends on WebGL2');
        assert(isColor(row.frame, [255, 181, 0]), `stage frame ${row.frame}`);
        assert(isColor(row.capture, [255, 181, 0]), `capture ${row.capture}`);
      }
      assert.deepEqual(pageErrors, []);
      row.passed = true;
    } catch (error) { row.passed = false; row.error = String(error.message || error); failed++; }
    results.push(row);
    await context.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(JSON.stringify({ chrome: browser.version?.(), args: process.env.CHROME_ARGS || null, results }, null, 1));
if (failed) { console.error(`${failed} renderer fallback case(s) failed`); process.exit(1); }
console.log(`Renderer fallback: ${results.length} cases passed.`);
