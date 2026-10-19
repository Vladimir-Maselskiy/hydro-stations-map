import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const output = new URL('../frontend/dist/', import.meta.url);
await mkdir(new URL('docs/', output), { recursive: true });
await copyFile(new URL('../api/openapi.json', import.meta.url), new URL('openapi.json', output));
await cp(require('swagger-ui-dist').getAbsoluteFSPath(), new URL('swagger-ui/', output), { recursive: true });
await writeFile(new URL('docs/index.html', output), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Station Map Test API</title><link rel="stylesheet" href="/swagger-ui/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/swagger-ui/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`);
console.log('Vercel static documentation prepared. Local Vite build is unchanged.');
