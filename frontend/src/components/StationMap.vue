<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatLevel } from '../utils/formatters.js';
const props = defineProps({
  stations: { type: Array, required: true },
  selected: { type: Object, default: null },
  total: { type: Number, required: true },
  loadedCount: { type: Number, required: true },
  favoritesOnly: Boolean,
  loading: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['select', 'bounds-change', 'reset', 'retry']);
const mapEl = ref(null),
  mapReady = ref(false),
  tileError = ref(false);
const markers = new Map();
let map, layer, observer;
function publishBounds() {
  const bounds = map.getBounds();
  emit(
    'bounds-change',
    [
      Math.max(-180, bounds.getWest()),
      Math.max(-90, bounds.getSouth()),
      Math.min(180, bounds.getEast()),
      Math.min(90, bounds.getNorth()),
    ].join(','),
  );
}
function resetView() {
  map?.fitBounds(
    [
      [46, 27],
      [51, 35],
    ],
    { padding: [25, 25] },
  );
}
defineExpose({ resetView });
watch(() => props.stations, renderMarkers);
watch(
  () => props.selected,
  (station) => {
    renderMarkers();
    if (station && map)
      map.setView(
        [station.coordinates.latitude, station.coordinates.longitude],
        Math.max(map.getZoom(), 10),
      );
  },
);
function renderMarkers() {
  if (!layer) return;
  const desired = new Map(props.stations.map((station) => [station.id, station]));
  if (props.selected) desired.set(props.selected.id, props.selected);
  for (const [id, entry] of markers) {
    if (!desired.has(id)) {
      layer.removeLayer(entry.marker);
      markers.delete(id);
    }
  }
  for (const [id, station] of desired) {
    const active = props.selected?.id === id;
    const style = {
      radius: active ? 10 : 6,
      color: active ? '#122f35' : '#fff',
      weight: active ? 3 : 2,
      fillColor: active ? '#f4c66b' : '#228b85',
      fillOpacity: 1,
    };
    let entry = markers.get(id);
    if (!entry) {
      const marker = L.circleMarker(
        [station.coordinates.latitude, station.coordinates.longitude],
        style,
      ).addTo(layer);
      entry = { marker, station, active };
      markers.set(id, entry);
      marker.bindTooltip('', { direction: 'top' });
      marker.on('click', () => emit('select', entry.station));
      const element = marker.getElement();
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          emit('select', entry.station);
        }
      });
    } else if (entry.active !== active) {
      entry.marker.setStyle(style);
      entry.marker.setRadius(style.radius);
    }
    entry.station = station;
    entry.active = active;
    entry.marker.setTooltipContent(
      `${station.name} · ${station.river} · ${formatLevel(station.latestMeasurement.value)} м`,
    );
    entry.marker
      .getElement()
      .setAttribute(
        'aria-label',
        `${station.name}, ${station.river}, ${formatLevel(station.latestMeasurement.value)} м`,
      );
  }
}
onMounted(() => {
  map = L.map(mapEl.value, {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 16,
    maxBounds: [
      [40, 18],
      [57, 44],
    ],
  });
  map.fitBounds(
    [
      [46, 27],
      [51, 35],
    ],
    { padding: [25, 25] },
  );
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  tiles.on('tileerror', () => {
    tileError.value = true;
  });
  layer = L.layerGroup().addTo(map);
  map.on('moveend', publishBounds);
  observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(mapEl.value);
  mapReady.value = true;
  publishBounds();
  renderMarkers();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  map?.off();
  map?.remove();
  markers.clear();
});
</script>

<template>
  <div class="map-section">
    <div ref="mapEl" class="map" aria-label="Інтерактивна карта станцій"></div>
    <div class="map-label">
      <span class="teal-dot"></span>
      Карта спостережень
      <span class="map-label-sub">Україна</span>
    </div>
    <div class="map-controls">
      <button aria-label="Збільшити карту" @click="map.zoomIn()">+</button>
      <button aria-label="Зменшити карту" @click="map.zoomOut()">−</button>
      <button
        class="fit-button"
        aria-label="Показати весь регіон"
        title="Показати весь регіон"
        @click="emit('reset')"
      >
        ⌖
      </button>
    </div>
    <div v-if="!favoritesOnly && total > loadedCount && !loading" class="map-page-notice">
      Показано {{ loadedCount }} із {{ total.toLocaleString('uk-UA') }} · наблизьте карту або
      завантажте ще
    </div>
    <div class="map-legend">
      <span>
        <i></i>
        Станція
      </span>
      <span>
        <i class="selected-key"></i>
        Обрана
      </span>
    </div>
    <div v-if="tileError" class="tile-notice" role="status">
      Тло карти недоступне. Перевірте інтернет; станції та пошук працюють.
    </div>
    <div v-if="error && !favoritesOnly" class="map-error" role="alert">
      <strong>Не вдалося оновити станції</strong>
      <p>{{ error }}</p>
      <button class="primary" @click="emit('retry')">Спробувати ще раз</button>
    </div>
    <div v-else-if="loading && !favoritesOnly" class="map-loading" role="status">
      Оновлюємо станції…
    </div>
    <div v-else-if="mapReady && !selected" class="map-hint">
      ⌖
      <span>Натисніть на точку, щоб відкрити станцію</span>
    </div>
  </div>
</template>

<style scoped>
.map-error {
  position: absolute;
  z-index: 3;
  left: 20px;
  right: 20px;
  bottom: 70px;
  max-width: 360px;
  padding: 16px;
  border: 1px solid #e6d9b6;
  border-radius: 10px;
  background: #fffdf5;
  box-shadow: 0 3px 16px #193b3e12;
  font-size: 12px;
}
.map-error p {
  margin: 8px 0 12px;
  color: #708385;
  line-height: 1.6;
}
@media (max-width: 700px) {
  .map-error {
    left: 12px;
    right: 12px;
  }
}
</style>
