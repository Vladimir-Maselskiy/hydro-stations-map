import { ref, watch, onScopeDispose } from 'vue';
import { request } from '../api.js';

export function useStations(query, bounds, fetchPage = request) {
  const stations = ref([]),
    total = ref(0),
    cursor = ref(null),
    loading = ref(false),
    error = ref('');
  const retryAppend = ref(false);
  let stationController,
    timer,
    disposed = false;
  async function loadStations(append = false) {
    if (disposed) return;
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
      total.value = result.pagination.totalItems;
      cursor.value = result.pagination.nextCursor;
    } catch (e) {
      if (!controller.signal.aborted && e.name !== 'AbortError') error.value = e.message;
    } finally {
      if (stationController === controller) loading.value = false;
    }
  }
  watch([query, bounds], ([search], [previousSearch]) => {
    // Search spans the entire dataset; map movement must not reset its pagination.
    if (search.trim() && search === previousSearch) return;
    stationController?.abort();
    clearTimeout(timer);
    timer = setTimeout(() => loadStations(), 350);
  });
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
