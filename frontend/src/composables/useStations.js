import { ref, computed, watch, onScopeDispose } from 'vue';
import { request } from '../api.js';

export function useStations(query, bounds, fetchPage = request) {
  const stations = ref([]),
    total = ref(0),
    cursor = ref(null),
    loading = ref(false),
    error = ref('');
  const retryAppend = ref(false);
  const criteria = computed(() => {
    const search = query.value.trim();
    return search ? `search=${encodeURIComponent(search)}` : `bbox=${bounds.value}`;
  });
  let loadedCriteria = null;
  let stationController,
    timer,
    disposed = false;
  async function loadStations(append = false) {
    if (disposed) return;
    clearTimeout(timer);
    // A cursor belongs only to the exact search/bounds that produced it.
    const requestedCriteria = criteria.value;
    append = append && loadedCriteria === requestedCriteria && cursor.value !== null;
    stationController?.abort();
    const controller = new AbortController();
    stationController = controller;
    loading.value = true;
    error.value = '';
    retryAppend.value = append;
    const params = new URLSearchParams({ limit: '100' });
    if (query.value.trim()) params.set('search', query.value.trim());
    else if (bounds.value) params.set('bbox', bounds.value);
    if (append && cursor.value) params.set('cursor', cursor.value);
    try {
      const result = await fetchPage(`/api/stations?${params}`, controller.signal);
      if (controller.signal.aborted) return;
      stations.value = append ? [...stations.value, ...result.data] : result.data;
      loadedCriteria = requestedCriteria;
      total.value = result.pagination.totalItems;
      cursor.value = result.pagination.nextCursor;
    } catch (e) {
      if (!controller.signal.aborted && e.name !== 'AbortError') error.value = e.message;
    } finally {
      if (stationController === controller) loading.value = false;
    }
  }
  watch(
    criteria,
    () => {
      stationController?.abort();
      stationController = null;
      clearTimeout(timer);
      cursor.value = null;
      retryAppend.value = false;
      error.value = '';
      loading.value = true;
      timer = setTimeout(() => loadStations(), 350);
    },
    { flush: 'sync' },
  );
  onScopeDispose(() => {
    disposed = true;
    stationController?.abort();
    clearTimeout(timer);
  });
  return {
    stations,
    total,
    cursor,
    loading,
    error,
    loadMore: () => loadStations(true),
    retry: () => loadStations(retryAppend.value),
  };
}
