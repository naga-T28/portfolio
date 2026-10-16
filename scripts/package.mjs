import { build } from 'astro';
import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Cross-platform release directory preparation; zip this directory in Finder
// or Explorer. No system-specific zip executable is required by this script.
const root = fileURLToPath(new URL('../', import.meta.url));
for (const dir of ['dist','dist-about']) {
  await rm(path.join(root,dir),{ recursive:true,force:true });
}
await build({ root, base:'/', outDir:'./dist' });
await build({ root, base:'/about/', outDir:'./dist-about' });
const release = path.join(root,'release');
await rm(release,{ recursive:true,force:true });
await mkdir(release,{ recursive:true });
for (const dir of ['src','public','docs','tests','scripts','licenses','dist','dist-about']) {
  await cp(path.join(root,dir),path.join(release,dir),{recursive:true});
}
for (const file of ['package.json','package-lock.json','astro.config.mjs','tsconfig.json','.nvmrc','.gitignore','README_ja.md']) {
  await copyFile(path.join(root,file),path.join(release,file));
}
console.log('Release folder ready:', release);
