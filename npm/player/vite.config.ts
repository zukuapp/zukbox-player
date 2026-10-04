import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  build: {
    outDir: resolve('npm/player/dist'),
    emptyOutDir: true,
    target: 'es2022',
    lib: {entry: resolve('npm/player/index.ts'), formats:['es'],fileName:()=> 'player.js'},
  },
  worker: { format:'es' },
});
