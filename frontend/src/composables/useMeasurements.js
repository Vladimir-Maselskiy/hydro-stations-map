import { ref, watch, onScopeDispose } from 'vue';
import { request } from '../api.js';
export function useMeasurements(stationId, fetchPage = request) {
  const readings = ref([]),
    detailLoading = ref(false),
    detailError = ref('');
  let detailController;
  async function loadReadings() {
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    readings.value = [];
    detailError.value = '';
    detailLoading.value = true;
    try {
      const result = await fetchPage(
        `/api/stations/${stationId()}/measurements?limit=100`,
        controller.signal,
      );
      if (!controller.signal.aborted) readings.value = result.data;
    } catch (e) {
      if (!controller.signal.aborted && e.name !== 'AbortError') detailError.value = e.message;
    } finally {
      if (detailController === controller) detailLoading.value = false;
    }
  }
  watch(stationId, loadReadings, { immediate: true });
  onScopeDispose(() => detailController?.abort());
  return { readings, loading: detailLoading, error: detailError, reload: loadReadings };
}
