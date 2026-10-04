import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(new URL('../..', import.meta.url).pathname);
const work = await mkdtemp(join(tmpdir(), 'zuku-player-types-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
try {
  const [metadata] = JSON.parse(run('npm', ['pack', './npm/player', '--json', '--pack-destination', work], root));
  await writeFile(join(work, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(work, metadata.filename)], work);
  await writeFile(join(work, 'consumer.ts'), `import player, {Next2D, next2d} from '@zuku/player';
const instance: Next2D = next2d;
const root = await instance.createRootMovieClip(640, 400, 30);
const shape = new player.display.Shape();
shape.graphics.beginFill(0x00bcf2).drawRect(0, 0, 80, 80).endFill();
root.addChild(shape);
const canvas: HTMLCanvasElement = await player.captureToCanvas(shape);
console.log(canvas.width);
`);
  await writeFile(join(work, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
    strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM', 'DOM.Iterable']
  }, include: ['consumer.ts'] }));
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(work, 'tsconfig.json')], root);
  const paths = metadata.files.map(file => file.path);
  assert(paths.includes('dist/player.js'));
  assert(paths.includes('LICENSE'));
  assert(paths.includes('THIRD_PARTY_NOTICES.md'));
  assert(!paths.some(path => /(^|\/)(node_modules|\.git|\.codex|\.npmrc|\.env)(\/|$)/.test(path)));
  console.log('Fresh packed consumer: strict TypeScript 6 declarations and package contents passed.');
} finally {
  await rm(work, { recursive: true, force: true });
}
