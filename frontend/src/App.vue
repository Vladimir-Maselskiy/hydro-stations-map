<script setup>
import { ref, computed } from 'vue';
import AppHeader from './components/AppHeader.vue';
import StationSidebar from './components/StationSidebar.vue';
import StationMap from './components/StationMap.vue';
import StationDetails from './components/StationDetails.vue';
import { useStations } from './composables/useStations.js';
import { useFavorites } from './composables/useFavorites.js';

const query = ref(''),
  bounds = ref(''),
  favoritesOnly = ref(false);
const selected = ref(null),
  stationMap = ref(null),
  mobileView = ref('map');
const { stations, total, cursor, loading, error, loadMore, retry } = useStations(query, bounds);
const { favorites, savedStations, toggleFavorite } = useFavorites();
const visible = computed(() =>
  favoritesOnly.value
    ? savedStations.value.filter((station) =>
        `${station.name} ${station.river}`
          .toLocaleLowerCase('uk')
          .includes(query.value.trim().toLocaleLowerCase('uk')),
      )
    : stations.value,
);
function selectStation(station) {
  selected.value = station;
}
function resetMap() {
  query.value = '';
  favoritesOnly.value = false;
  stationMap.value?.resetView();
}
</script>
<template>
  <div class="app-shell">
    <AppHeader />
    <main>
      <div class="workspace-heading">
        <div>
          <p class="eyebrow">ГІДРОЛОГІЧНІ СПОСТЕРЕЖЕННЯ</p>
          <h1>Вода в русі. Дані поруч.</h1>
          <p class="subtitle">Знайдіть станцію на карті та стежте за змінами рівня води.</p>
        </div>
        <div class="coverage">
          <span class="coverage-icon">◎</span>
          <div>
            <strong>10 000</strong>
            <span>станцій у наборі даних</span>
          </div>
        </div>
      </div>
      <div class="mobile-switch" aria-label="Вигляд">
        <button :class="{ active: mobileView === 'map' }" @click="mobileView = 'map'">Карта</button>
        <button :class="{ active: mobileView === 'list' }" @click="mobileView = 'list'">
          Список станцій
        </button>
      </div>
      <section class="workspace" :class="{ 'show-list': mobileView === 'list' }">
        <StationSidebar
          v-model:query="query"
          v-model:favorites-only="favoritesOnly"
          :favorites="favorites"
          :visible="visible"
          :stations="stations"
          :selected="selected"
          :total="total"
          :cursor="cursor"
          :loading="loading"
          :error="error"
          @select="selectStation"
          @toggle-favorite="toggleFavorite"
          @reset="resetMap"
          @retry="retry"
          @load-more="loadMore"
        />
        <StationMap
          ref="stationMap"
          :stations="visible"
          :selected="selected"
          :total="total"
          :loaded-count="stations.length"
          :favorites-only="favoritesOnly"
          :loading="loading"
          @select="selectStation"
          @bounds-change="bounds = $event"
          @reset="resetMap"
        />
      </section>
      <footer class="page-footer">
        <span>Гідро · Карта станцій вимірювання рівня води</span>
        <span>Синтетичні дані · Не для оцінки паводкових ризиків</span>
      </footer>
    </main>
    <StationDetails
      v-if="selected"
      :station="selected"
      :favorite="favorites.includes(selected.id)"
      @close="selected = null"
      @toggle-favorite="toggleFavorite"
    />
  </div>
</template>
