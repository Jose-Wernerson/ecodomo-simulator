// Gera dist-artifact/ecodomo.html: página única, com React e Three.js carregados de CDN.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const globals = { three: 'THREE', react: 'React', 'react-dom/client': 'ReactDOM' };
const plugin = { name: 'globals', setup(b) {
  b.onResolve({ filter: /^(three|react|react-dom\/client)$/ }, (a) => ({ path: a.path, namespace: 'g' }));
  b.onLoad({ filter: /.*/, namespace: 'g' }, (a) => ({ contents: `module.exports = window.${globals[a.path]}`, loader: 'js' }));
} };
const r = await build({ entryPoints: ['src/main.tsx'], bundle: true, minify: true, write: false, outdir: 'o', plugins: [plugin], format: 'iife', target: 'es2020', tsconfig: 'tsconfig.json', logLevel: 'warning' });
const js = r.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/g, '<\\/script');
const css = r.outputFiles.find((f) => f.path.endsWith('.css')).text;
const html = `<title>EcoDomo Simulator</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js"></script>
<script>${js}</script>
`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/ecodomo.html', html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
