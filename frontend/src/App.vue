<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { request, chartGeometry } from './api.js';
const query = ref(''), stations = ref([]), total = ref(0), cursor = ref(null), loading = ref(false), error = ref('');
const selected = ref(null), readings = ref([]), detailLoading = ref(false), detailError = ref(''), period = ref(14);
const mapEl = ref(), mobileView = ref('map'), mapReady = ref(false), tileError = ref(false);
let disposed = false;
const retryAppend = ref(false);
const markers = new Map();
let map, layer, stationController, detailController, searchTimer, boundsTimer, observer, returnFocus;
let favoritesInitial = [];
try { favoritesInitial = JSON.parse(localStorage.getItem('hydro-favorites') || '[]'); } catch {}
const favorites = ref(Array.isArray(favoritesInitial) ? favoritesInitial.filter(x => typeof x === 'string') : []);
let savedStations = {};
try { const stored = JSON.parse(localStorage.getItem('hydro-saved-stations') || '{}'); if (stored && typeof stored === 'object' && !Array.isArray(stored)) savedStations = stored; } catch {}
const favoriteStations = ref(Object.fromEntries(Object.entries(savedStations).filter(([id, s]) => favorites.value.includes(id) && s?.coordinates && s?.latestMeasurement)));
const favoritesOnly = ref(false);
const visible = computed(() => favoritesOnly.value ? Object.values(favoriteStations.value).filter(s => `${s.name} ${s.river}`.toLocaleLowerCase('uk').includes(query.value.trim().toLocaleLowerCase('uk'))) : stations.value);
const chart = computed(() => chartGeometry(readings.value.slice(0, period.value)));
const delta = computed(() => readings.value.length > 1 ? readings.value[0].value - readings.value[1].value : null);
const number = value => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const date = (value, full = false) => new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: full ? 'long' : 'short', ...(full ? { year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : {}), timeZone: 'Europe/Kyiv' }).format(new Date(value));
function toggleFavorite(id) {
  if (favorites.value.includes(id)) { favorites.value = favorites.value.filter(x => x !== id); delete favoriteStations.value[id]; }
  else { const station = stations.value.find(s => s.id === id) || (selected.value?.id === id ? selected.value : null); if (!station) return; favorites.value = [...favorites.value, id]; favoriteStations.value[id] = station; }
  try { localStorage.setItem('hydro-favorites', JSON.stringify(favorites.value)); localStorage.setItem('hydro-saved-stations', JSON.stringify(favoriteStations.value)); } catch {}
}
async function loadStations(append = false) {
  if (disposed) return;
  stationController?.abort(); const controller = new AbortController(); stationController = controller;
  loading.value = true; error.value = '';
  retryAppend.value = append;
  const params = new URLSearchParams({ limit: '100' });
  if (query.value.trim()) params.set('search', query.value.trim());
  else if (map) { const b = map.getBounds(); params.set('bbox', [Math.max(-180, b.getWest()), Math.max(-90, b.getSouth()), Math.min(180, b.getEast()), Math.min(90, b.getNorth())].join(',')); }
  if (append && cursor.value) params.set('cursor', cursor.value);
  try { const result = await request(`/api/stations?${params}`, controller.signal); if (controller.signal.aborted) return; stations.value = append ? [...stations.value, ...result.data] : result.data; total.value = result.pagination.totalItems; cursor.value = result.pagination.nextCursor; }
  catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (stationController === controller) loading.value = false; }
}
async function loadReadings() {
  detailController?.abort(); const controller = new AbortController(); detailController = controller;
  readings.value = []; detailError.value = ''; detailLoading.value = true;
  try { const result = await request(`/api/stations/${selected.value.id}/measurements?limit=100`, controller.signal); if (!controller.signal.aborted) readings.value = result.data; }
  catch (e) { if (e.name !== 'AbortError') detailError.value = e.message; }
  finally { if (detailController === controller) detailLoading.value = false; }
}
function selectStation(station) { returnFocus = document.activeElement; selected.value = station; loadReadings(); map?.setView([station.coordinates.latitude, station.coordinates.longitude], Math.max(map.getZoom(), 10)); nextTick(() => document.querySelector('.close-button')?.focus()); }
function closeDetail() { selected.value = null; detailController?.abort(); nextTick(() => { if (returnFocus?.isConnected) returnFocus.focus(); else document.querySelector('.search-box input')?.focus(); }); }
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const elements = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input, [tabindex="0"]')];
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function resetMap() { query.value = ''; favoritesOnly.value = false; map.fitBounds([[46, 27], [51, 35]], { padding: [25,25] }); }
function renderMarkers() {
  if (!layer) return;
  const desired = new Map(visible.value.map(station => [station.id, station]));
  if (selected.value) desired.set(selected.value.id, selected.value);
  for (const [id, entry] of markers) {
    if (!desired.has(id)) { layer.removeLayer(entry.marker); markers.delete(id); }
  }
  for (const [id, station] of desired) {
    const active = selected.value?.id === id;
    const style = { radius: active ? 10 : 6, color: active ? '#122f35' : '#fff', weight: active ? 3 : 2, fillColor: active ? '#f4c66b' : '#228b85', fillOpacity: 1 };
    let entry = markers.get(id);
    if (!entry) {
      const marker = L.circleMarker([station.coordinates.latitude, station.coordinates.longitude], style).addTo(layer);
      entry = { marker, station, active };
      markers.set(id, entry);
      marker.bindTooltip('', { direction: 'top' });
      marker.on('click', () => selectStation(entry.station));
      const element = marker.getElement();
      element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button');
      element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectStation(entry.station); } });
    } else if (entry.active !== active) {
      entry.marker.setStyle(style);
      entry.marker.setRadius(style.radius);
    }
    entry.station = station;
    entry.active = active;
    entry.marker.setTooltipContent(`${station.name} · ${station.river} · ${number(station.latestMeasurement.value)} м`);
    entry.marker.getElement().setAttribute('aria-label', `${station.name}, ${station.river}, ${number(station.latestMeasurement.value)} м`);
  }
}
watch([visible, selected], renderMarkers);
watch(query, () => { clearTimeout(searchTimer); stationController?.abort(); searchTimer = setTimeout(() => loadStations(), 350); });
watch(mobileView, async () => { await nextTick(); map?.invalidateSize(); });
onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: false, minZoom: 5, maxZoom: 16, maxBounds: [[40, 18], [57, 44]] });
  map.fitBounds([[46,27],[51,35]], { padding: [25,25] });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
  tiles.on('tileerror', () => { tileError.value = true; });
  layer = L.layerGroup().addTo(map);
  map.on('moveend', () => { if (query.value.trim()) return; clearTimeout(boundsTimer); boundsTimer = setTimeout(() => loadStations(), 300); });
  observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(mapEl.value);
  mapReady.value = true; loadStations();
});
onBeforeUnmount(() => { disposed = true; map?.off(); stationController?.abort(); detailController?.abort(); clearTimeout(searchTimer); clearTimeout(boundsTimer); observer?.disconnect(); map?.remove(); });
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="./" aria-label="Гідро — головна"><span class="brand-icon">≈</span><span>гідро<span class="brand-dot">.</span></span></a>
      <span class="header-divider"></span><span class="header-description">Моніторинг рівня води</span>
      <div class="demo-badge"><span></span>Демонстраційні дані</div>
      <a class="api-link" href="/docs/" target="_blank" rel="noopener">API ↗</a>
    </header>
    <main>
      <div class="workspace-heading"><div><p class="eyebrow">ГІДРОЛОГІЧНІ СПОСТЕРЕЖЕННЯ</p><h1>Вода в русі. Дані поруч.</h1><p class="subtitle">Знайдіть станцію на карті та стежте за змінами рівня води.</p></div><div class="coverage"><span class="coverage-icon">◎</span><div><strong>10 000</strong><span>станцій у наборі даних</span></div></div></div>
      <div class="mobile-switch" aria-label="Вигляд"><button :class="{active: mobileView === 'map'}" @click="mobileView = 'map'">Карта</button><button :class="{active: mobileView === 'list'}" @click="mobileView = 'list'">Список станцій</button></div>
      <section class="workspace" :class="{'show-list': mobileView === 'list'}">
        <aside class="sidebar" aria-label="Пошук станцій">
          <div class="search-section"><div class="section-title"><h2>Станції</h2><span class="count">{{ total.toLocaleString('uk-UA') }}</span></div><label class="search-box"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="Назва станції або річки" aria-label="Пошук за назвою станції або річки"><button v-if="query" class="clear-search" @click="query = ''" aria-label="Очистити пошук">×</button></label><div class="list-tabs"><button :class="{ active: !favoritesOnly }" @click="favoritesOnly = false">Усі станції</button><button :class="{ active: favoritesOnly }" @click="favoritesOnly = true">☆ Обрані <span v-if="favorites.length">{{ favorites.length }}</span></button></div></div>
          <div class="list-description">{{ favoritesOnly ? 'Ваші збережені станції · усі області' : query.trim() ? 'Результати в усьому наборі даних' : 'У видимій області карти' }}<span v-if="loading" class="loading-dot"></span></div>
          <div class="station-list" :aria-busy="loading">
            <div v-if="error" class="state-card" role="alert"><strong>Дані тимчасово недоступні</strong><p>{{ error }}</p><button class="primary small" @click="loadStations(retryAppend)">Спробувати ще раз</button></div>
            <template v-if="loading && !stations.length"><div v-for="n in 6" :key="n" class="skeleton-row"><i></i><i></i></div></template>
            <div v-else-if="!visible.length && !error" class="state-card"><span class="empty-icon">⌕</span><strong>{{ favoritesOnly ? 'Обраних станцій не знайдено' : 'Станцій не знайдено' }}</strong><p>{{ favoritesOnly ? 'Додайте станцію зірочкою або змініть пошук. Обрані зберігаються у вашому браузері.' : 'Змініть пошук або перемістіть карту до іншої області.' }}</p><button class="text-button" @click="query = ''; favoritesOnly = false; resetMap()">Скинути фільтри</button></div>
            <article v-for="station in visible" :key="station.id" class="station-row" :class="{selected: selected?.id === station.id}"><button class="station-select" @click="selectStation(station)"><span class="station-symbol">≈</span><span class="station-copy"><strong>{{ station.name }}</strong><span>р. {{ station.river }}</span></span><span class="station-value">{{ number(station.latestMeasurement.value) }}<small> м</small><span>рівень води</span></span></button><button class="favorite" :class="{saved: favorites.includes(station.id)}" :aria-label="`${favorites.includes(station.id) ? 'Прибрати з обраних' : 'Додати до обраних'}: ${station.name}`" :aria-pressed="favorites.includes(station.id)" @click="toggleFavorite(station.id)">{{ favorites.includes(station.id) ? '★' : '☆' }}</button></article>
            <button v-if="cursor && !favoritesOnly" class="load-more" :disabled="loading" @click="loadStations(true)">{{ loading ? 'Завантаження…' : `Показати ще · ${stations.length} із ${total.toLocaleString('uk-UA')}` }}</button>
          </div><div class="sidebar-footer"><span class="teal-dot"></span>Оберіть станцію, щоб побачити динаміку</div>
        </aside>
        <div class="map-section"><div ref="mapEl" class="map" aria-label="Інтерактивна карта станцій"></div><div class="map-label"><span class="teal-dot"></span>Карта спостережень<span class="map-label-sub">Україна</span></div><div class="map-controls"><button aria-label="Збільшити карту" @click="map.zoomIn()">+</button><button aria-label="Зменшити карту" @click="map.zoomOut()">−</button><button class="fit-button" aria-label="Показати весь регіон" title="Показати весь регіон" @click="resetMap">⌖</button></div><div v-if="!favoritesOnly && total > stations.length && !loading" class="map-page-notice">Показано {{ stations.length }} із {{ total.toLocaleString('uk-UA') }} · наблизьте карту або завантажте ще</div><div class="map-legend"><span><i></i>Станція</span><span><i class="selected-key"></i>Обрана</span></div><div v-if="tileError" class="tile-notice" role="status">Тло карти недоступне. Перевірте інтернет; станції та пошук працюють.</div><div v-if="loading" class="map-loading" role="status">Оновлюємо станції…</div><div v-else-if="mapReady && !selected" class="map-hint">⌖ <span>Натисніть на точку, щоб відкрити станцію</span></div></div>
      </section>
      <footer class="page-footer"><span>Гідро · Карта станцій вимірювання рівня води</span><span>Синтетичні дані · Не для оцінки паводкових ризиків</span></footer>
    </main>
    <div v-if="selected" class="detail-backdrop" @click.self="closeDetail">
      <section class="detail-panel" role="dialog" aria-modal="true" :aria-label="`Вимірювання: ${selected.name}`" @keydown.esc="closeDetail" @keydown="trapFocus" tabindex="-1">
        <header class="detail-header"><div><p class="eyebrow">СТАНЦІЯ СПОСТЕРЕЖЕНЬ · {{ selected.id }}</p><h2>{{ selected.name }} <button class="favorite inline" :aria-label="favorites.includes(selected.id) ? 'Прибрати з обраних' : 'Додати до обраних'" :aria-pressed="favorites.includes(selected.id)" @click="toggleFavorite(selected.id)">{{ favorites.includes(selected.id) ? '★' : '☆' }}</button></h2><p>р. {{ selected.river }} <span>· {{ selected.coordinates.latitude.toFixed(4) }}° N, {{ selected.coordinates.longitude.toFixed(4) }}° E</span></p></div><button class="close-button" aria-label="Закрити вимірювання" @click="closeDetail">×</button></header>
        <div class="detail-content"><div class="reading-summary"><div><span class="muted">Останній рівень води</span><div class="big-number">{{ number(selected.latestMeasurement.value) }} <span>м</span></div><span class="reading-date">{{ date(selected.latestMeasurement.measuredAt, true) }}</span></div><div v-if="delta !== null" class="delta" :class="{falling: delta < 0}"><strong>{{ delta > 0 ? '↗ +' : delta < 0 ? '↘ ' : '→ ' }}{{ number(delta) }} м</strong><span>до попереднього виміру</span></div></div>
        <div v-if="detailLoading" class="detail-state" role="status">Завантажуємо історію вимірювань…</div><div v-else-if="detailError" class="state-card" role="alert"><p>{{ detailError }}</p><button class="primary" @click="loadReadings">Повторити запит</button></div><template v-else-if="readings.length"><div class="chart-heading"><h3>Динаміка рівня</h3><div class="period-switch"><button v-for="days in [7,14,36]" :key="days" :class="{active: period === days}" @click="period = days">{{ days }} днів</button></div></div><div class="chart"><svg viewBox="0 0 570 190" role="img" :aria-label="`Графік рівня води за ${Math.min(period, readings.length)} днів, від ${number(chart.min)} до ${number(chart.max)} метра`"><defs><linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2c9188" stop-opacity=".22"/><stop offset="100%" stop-color="#2c9188" stop-opacity="0"/></linearGradient></defs><g v-for="t in [0,.5,1]" :key="t"><line x1="40" x2="550" :y1="20+t*140" :y2="20+t*140" stroke="#e2eae8" stroke-dasharray="4 4"/><text x="0" :y="24+t*140">{{ number(chart.max-(chart.max-chart.min)*t) }}</text></g><polygon :points="`40,160 ${chart.points} 550,160`" fill="url(#waterFill)"/><polyline :points="chart.points" fill="none" stroke="#25877e" stroke-width="3" stroke-linejoin="round"/><circle v-for="(m,i) in chart.values" :key="m.id" :cx="40+i/Math.max(chart.values.length-1,1)*510" :cy="160-(m.value-chart.min)/(chart.max-chart.min)*140" r="3.5" fill="#25877e" stroke="white" stroke-width="1.5"><title>{{ date(m.measuredAt, true) }}: {{ number(m.value) }} м</title></circle><text x="40" y="185">{{ date(chart.values[0].measuredAt) }}</text><text x="550" y="185" text-anchor="end">{{ date(chart.values.at(-1).measuredAt) }}</text></svg></div><div class="table-heading"><h3>Історія вимірювань</h3><span>{{ readings.length }} записів</span></div><div class="measurements-table"><table><thead><tr><th>Дата та час · Київ</th><th>Рівень</th><th>Зміна</th></tr></thead><tbody><tr v-for="(m,i) in readings.slice(0,period)" :key="m.id"><td>{{ date(m.measuredAt, true) }}</td><td><strong>{{ number(m.value) }} {{ m.unit }}</strong></td><td>{{ readings[i+1] ? `${m.value-readings[i+1].value > 0 ? '+' : ''}${number(m.value-readings[i+1].value)} м` : '—' }}</td></tr></tbody></table></div></template><p v-else class="detail-state">Вимірювань ще немає.</p><p class="detail-note">Демонстраційний набір. Висота рівня сама по собі не визначає небезпеку: пороги та відмітка нуля поста не надані.</p></div>
      </section>
    </div>
  </div>
</template>




