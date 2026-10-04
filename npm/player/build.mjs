import { spawnSync } from 'node:child_process';
import { copyFile, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { relative, dirname, resolve } from 'node:path';
const root=resolve(new URL('../..',import.meta.url).pathname);
for(const args of [['vite','build','--config','npm/player/vite.config.ts'],['tsc','-p','npm/player/tsconfig.json']]){
  const result=spawnSync('npx',['--no-install',...args],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
async function rewrite(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name);if(item.isDirectory())await rewrite(path);else if(item.name.endsWith('.d.ts')){let text=await readFile(path,'utf8');text=text.replace(/(["'])@next2d\/([a-z-]+)\1/g,(_,quote,name)=>{let target=relative(dirname(path),resolve(root,'npm/player/types/packages',name,'src/index.js')).replaceAll('\\','/');if(!target.startsWith('.'))target='./'+target;return quote+target+quote});await writeFile(path,text)}}}
await rewrite(resolve(root,'npm/player/types'));
await copyFile(resolve(root,'LICENSE'),resolve(root,'npm/player/LICENSE'));
await mkdir(resolve(root,'npm/player/assets'),{recursive:true});
const logos=await readdir(resolve(root,'docs/branding'));
for(const logo of logos.filter(x=>x.endsWith('.png')))await copyFile(resolve(root,'docs/branding',logo),resolve(root,'npm/player/assets',logo));
console.log('ZUKU player distribution built. Original source and upstream package namespaces were not rewritten.');
