import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { createTestApiMiddleware } from './api-middleware.js';

describe('local test API', () => {
  let server;
  let origin;

  before(async () => {
    server = createServer(createTestApiMiddleware({ errorRate: 0 }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('paginates the station collection without returning the full dataset', async () => {
    const firstResponse = await fetch(`${origin}/api/stations?limit=2`);
    const first = await firstResponse.json();
    const secondResponse = await fetch(`${origin}/api/stations?limit=2&cursor=2`);
    const second = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(first.data.length, 2);
    assert.equal(first.pagination.totalItems, 10_000);
    assert.equal(first.pagination.nextCursor, '2');
    assert.equal(second.data[0].id, 'st-00003');
  });

  it('filters stations by search text and map bounds', async () => {
    const response = await fetch(
      `${origin}/api/stations?search=00001&bbox=26,45,36,52&limit=5`,
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result.data.map((station) => station.id), ['st-00001']);
    assert.equal(result.pagination.totalItems, 1);
  });

  it('returns measurement history only for the requested station', async () => {
    const response = await fetch(`${origin}/api/stations/st-00001/measurements?limit=2`);
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.data.length, 2);
    assert.equal(result.pagination.totalItems, 36);
    assert.equal(result.data[0].id, 'st-00001-m-001');
  });

  it('returns a validation error for an invalid page size', async () => {
    const response = await fetch(`${origin}/api/stations?limit=101`);
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.error.code, 'INVALID_LIMIT');
  });

  it('rejects an incomplete bounding box', async () => {
    const response = await fetch(`${origin}/api/stations?bbox=27,,35,51`);
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.error.code, 'INVALID_BBOX');
  });

  it('keeps health checks available when API requests fail', async () => {
    const failingServer = createServer(
      createTestApiMiddleware({ errorRate: 1, random: () => 0 }),
    );
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const failingOrigin = `http://127.0.0.1:${failingServer.address().port}`;

    try {
      const health = await fetch(`${failingOrigin}/health`);
      const stations = await fetch(`${failingOrigin}/api/stations`);

      assert.equal(health.status, 200);
      assert.equal(stations.status, 503);
      const result = await stations.json();
      assert.equal(result.error.code, 'SERVICE_UNAVAILABLE');
    } finally {
      await new Promise((resolve, reject) =>
        failingServer.close((error) => error ? reject(error) : resolve()),
      );
    }
  });

  it('can return a temporary service error from the configured random failure rate', async () => {
    const failingServer = createServer(
      createTestApiMiddleware({ errorRate: 1, random: () => 0.75 }),
    );
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));

    try {
      const response = await fetch(`http://127.0.0.1:${failingServer.address().port}/api/stations`);
      const result = await response.json();

      assert.equal(response.status, 503);
      assert.equal(result.error.code, 'SERVICE_UNAVAILABLE');
    } finally {
      await new Promise((resolve, reject) =>
        failingServer.close((error) => error ? reject(error) : resolve()),
      );
    }
  });
});
