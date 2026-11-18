import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/app/', import.meta.url));
const output = await build({
  entryPoints: [fileURLToPath(new URL('./src/main.jsx', import.meta.url))],
  outfile: root + 'js/aurora-orrery.js', bundle: true, minify: true, write: false,
  format: 'iife', target: ['chrome110', 'safari16'], jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof', metafile: true,
});
await mkdir(root + 'js', { recursive: true });
await mkdir(root + 'css', { recursive: true });
await rm(root + 'js/aurora-orrery.css', { force: true });
await rm(root + 'js/aurora-orrery.js.LEGAL.txt', { force: true });
for (const artifact of output.outputFiles) {
  const isCss = extname(artifact.path) === '.css';
  const target = isCss ? root + 'css/aurora-orrery.css' : root + 'js/aurora-orrery.js';
  await writeFile(target, artifact.contents);
}
await writeFile(new URL('./bundle-meta.json', import.meta.url), JSON.stringify(output.metafile, null, 2));
console.log('Built local React / Framer Motion presentation layer.');
