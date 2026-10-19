import { createServer } from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import stationsHandler from '../api/stations.js';
import measurementsHandler from '../api/stations/[station_id]/measurements.js';
import healthHandler from '../api/health.js';
import { createVercelHandler } from './handler.js';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('deployment entry points export callable Node handlers', () => {
  for (const handler of [stationsHandler, measurementsHandler, healthHandler]) assert.equal(typeof handler, 'function');
});

test('Vercel adapter preserves filtering, pagination and station histories', async () => {
  await withServer(createVercelHandler({ errorRate: 0 }), async origin => {
    const first = await fetch(`${origin}/api/stations?search=Дніпро&bbox=27,46,35,51&limit=2`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const page = await first.json();
    assert.equal(page.data.length, 2);
    assert.equal(page.pagination.totalItems, 2000);
    const next = await (await fetch(`${origin}/api/stations?search=Дніпро&cursor=${page.pagination.nextCursor}&limit=2`)).json();
    assert.notEqual(next.data[0].id, page.data[0].id);
    const history = await (await fetch(`${origin}/api/stations/${page.data[0].id}/measurements?limit=100`)).json();
    assert.equal(history.data.length, 36);
    assert.ok(history.data.every(m => m.id.startsWith(page.data[0].id)));
    assert.equal((await fetch(`${origin}/api/stations?limit=101`)).status, 400);
    assert.equal((await fetch(`${origin}/api/stations/missing/measurements`)).status, 404);
  });
});

test('Vercel health and docs remain available when every data request returns 503', async () => {
  await withServer(createVercelHandler({ errorRate: 1 }), async origin => {
    assert.equal((await fetch(`${origin}/api/stations`)).status, 503);
    assert.equal((await fetch(`${origin}/api/stations/st-00001/measurements`)).status, 503);
    assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), { status: 'ok' });
    assert.equal((await fetch(`${origin}/docs/`)).status, 200);
    assert.equal((await fetch(`${origin}/openapi.json`)).status, 200);
  });
});
