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
