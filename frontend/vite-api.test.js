import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

describe('Vite test API integration', () => {
  let server;
  let origin;
  let previousErrorRate;

  before(async () => {
    previousErrorRate = process.env.TEST_API_ERROR_RATE;
    process.env.TEST_API_ERROR_RATE = '0';
    server = await createServer({
      configFile: fileURLToPath(new URL('./vite.config.js', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  });

  after(async () => {
    if (server) await server.close();
    if (previousErrorRate === undefined) {
      delete process.env.TEST_API_ERROR_RATE;
    } else {
      process.env.TEST_API_ERROR_RATE = previousErrorRate;
    }
  });

  it('serves the API and English Swagger UI from the frontend dev server', async () => {
    const healthResponse = await fetch(`${origin}/health`);
    const docsResponse = await fetch(`${origin}/docs/`);
    const specResponse = await fetch(`${origin}/openapi.json`);
    const swaggerAssetResponse = await fetch(`${origin}/swagger-ui/swagger-ui-bundle.js`);

    assert.equal(healthResponse.headers.get('content-type')?.split(';')[0], 'application/json');
    assert.deepEqual(await healthResponse.json(), { status: 'ok' });
    assert.match(await docsResponse.text(), /Station Map Test API/);
    assert.equal(specResponse.headers.get('content-type')?.split(';')[0], 'application/json');
    const spec = await specResponse.json();
    assert.equal(spec.info.title, 'Station Map Test API');
    assert.equal(spec.paths['/api/stations'].get.summary, 'List stations with their latest measurements');
    const documentation = [spec.info.title, spec.info.description];
    for (const path of Object.values(spec.paths)) {
      for (const operation of Object.values(path)) {
        documentation.push(operation.summary, operation.description);
        for (const parameter of operation.parameters ?? []) {
          documentation.push(parameter.description);
        }
        for (const response of Object.values(operation.responses ?? {})) {
          documentation.push(response.description);
        }
      }
    }
    assert.doesNotMatch(documentation.join(' '), /[\u0400-\u04FF]/);
    assert.ok((await swaggerAssetResponse.text()).includes('SwaggerUIBundle'));
  });
});
