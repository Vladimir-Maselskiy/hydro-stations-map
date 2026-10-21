import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref, nextTick } from 'vue';
import { useStations } from './src/composables/useStations.js';
import { useMeasurements } from './src/composables/useMeasurements.js';
import { useFavorites } from './src/composables/useFavorites.js';

const wait = () => new Promise((resolve) => setTimeout(resolve, 400));
const page = (data, nextCursor = null) => ({
  data,
  pagination: { totalItems: data.length, nextCursor },
});

test('station refresh retains the previous page while pending and after failure', async () => {
  const scope = effectScope();
  const bounds = ref('27,46,35,51'),
    query = ref('');
  let resolvePage;
  const calls = [];
  const state = scope.run(() =>
    useStations(query, bounds, (url, signal) => {
      calls.push({ url, signal });
      return new Promise((resolve, reject) => {
        resolvePage = { resolve, reject };
      });
    }),
  );
  try {
    const first = state.retry();
    resolvePage.resolve(page([{ id: 'a' }], '100'));
    await first;
    bounds.value = '28,47,34,50';
    await nextTick();
    await wait();
    assert.deepEqual(state.stations.value, [{ id: 'a' }]);
    assert.equal(state.loading.value, true);
    resolvePage.reject(new Error('offline'));
    await nextTick();
    assert.equal(state.error.value, 'offline');
    assert.equal(state.stations.value[0].id, 'a');
    const retry = state.retry();
    assert.ok(!calls.at(-1).url.includes('cursor='));
    resolvePage.resolve(page([{ id: 'b' }]));
    await retry;
    assert.equal(state.stations.value[0].id, 'b');
  } finally {
    scope.stop();
  }
});

test('old measurement responses cannot overwrite the currently selected station', async () => {
  const scope = effectScope();
  const id = ref('first');
  const pending = [];
  const state = scope.run(() =>
    useMeasurements(
      () => id.value,
      (url, signal) => new Promise((resolve) => pending.push({ url, signal, resolve })),
    ),
  );
  try {
    id.value = 'second';
    await nextTick();
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve(page([{ id: 'second-reading' }]));
    await nextTick();
    pending[0].resolve(page([{ id: 'first-reading' }]));
    await nextTick();
    assert.equal(state.readings.value[0].id, 'second-reading');
    assert.equal(state.loading.value, false);
  } finally {
    scope.stop();
  }
});

test('disposing station state cancels pending requests', async () => {
  const scope = effectScope();
  let signal;
  const state = scope.run(() =>
    useStations(ref(''), ref(''), (_, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    }),
  );
  state.retry();
  scope.stop();
  assert.equal(signal.aborted, true);
});

test('moving the map does not restart a global search', async () => {
  const scope = effectScope();
  const query = ref('river');
  const bounds = ref('27,46,35,51');
  let calls = 0;
  scope.run(() =>
    useStations(query, bounds, async () => {
      calls++;
      return page([]);
    }),
  );
  try {
    bounds.value = '28,47,34,50';
    await nextTick();
    await wait();
    assert.equal(calls, 0);
    query.value = 'different river';
    await nextTick();
    await wait();
    assert.equal(calls, 1);
  } finally {
    scope.stop();
  }
});

test('favorites can be toggled when browser storage is unavailable', () => {
  const state = useFavorites();
  const station = { id: 'saved', name: 'Example' };
  state.toggleFavorite(station);
  assert.deepEqual(state.favorites.value, ['saved']);
  assert.equal(state.savedStations.value[0].id, station.id);
  state.toggleFavorite(station);
  assert.equal(state.savedStations.value.length, 0);
});

for (const change of ['search', 'bounds']) {
  test(`changing ${change} cannot append using the previous cursor, even before debounce`, async () => {
    const scope = effectScope();
    const query = ref('');
    const bounds = ref('27,46,35,51');
    const urls = [];
    const state = scope.run(() =>
      useStations(query, bounds, async (url) => {
        urls.push(url);
        return page([{ id: urls.length === 1 ? 'old' : 'new' }], '100');
      }),
    );
    try {
      await state.retry();
      assert.equal(state.cursor.value, '100');
      if (change === 'search') query.value = 'new river';
      else bounds.value = '28,47,34,50';
      assert.equal(state.cursor.value, null);
      assert.equal(state.loading.value, true);
      await state.loadMore();
      assert.equal(new URL(urls.at(-1), 'http://localhost').searchParams.has('cursor'), false);
      assert.deepEqual(state.stations.value, [{ id: 'new' }]);
      await wait();
      assert.equal(urls.length, 2, 'manual refresh cancels the scheduled duplicate');
    } finally {
      scope.stop();
    }
  });
}

test('failed next page retries the same cursor without losing loaded stations', async () => {
  const scope = effectScope();
  let fail = true;
  const urls = [];
  const state = scope.run(() =>
    useStations(ref('river'), ref(''), async (url) => {
      urls.push(url);
      if (url.includes('cursor=')) {
        if (fail) throw new Error('temporary failure');
        return page([{ id: 'second' }]);
      }
      return page([{ id: 'first' }], '100');
    }),
  );
  try {
    await state.retry();
    await state.loadMore();
    assert.equal(state.error.value, 'temporary failure');
    assert.deepEqual(state.stations.value, [{ id: 'first' }]);
    fail = false;
    await state.retry();
    assert.equal(urls.at(-1), urls.at(-2));
    assert.deepEqual(state.stations.value, [{ id: 'first' }, { id: 'second' }]);
    assert.equal(state.cursor.value, null);
  } finally {
    scope.stop();
  }
});
