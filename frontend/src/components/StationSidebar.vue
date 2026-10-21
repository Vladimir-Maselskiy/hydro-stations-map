<script setup>
import StationListItem from './StationListItem.vue';
defineProps({
  query: { type: String, default: '' },
  favoritesOnly: Boolean,
  favorites: { type: Array, required: true },
  visible: { type: Array, required: true },
  stations: { type: Array, required: true },
  selected: { type: Object, default: null },
  total: { type: Number, required: true },
  cursor: { type: String, default: null },
  loading: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits([
  'update:query',
  'update:favoritesOnly',
  'select',
  'toggle-favorite',
  'reset',
  'retry',
  'load-more',
]);
</script>

<template>
  <aside class="sidebar" aria-label="Пошук станцій">
    <div class="search-section">
      <div class="section-title">
        <h2>Станції</h2>
        <span class="count">
          {{ (favoritesOnly ? visible.length : total).toLocaleString('uk-UA') }}
        </span>
      </div>
      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          :value="query"
          @input="emit('update:query', $event.target.value)"
          type="search"
          placeholder="Назва станції або річки"
          aria-label="Пошук за назвою станції або річки"
        />
        <button
          v-if="query"
          class="clear-search"
          @click="emit('update:query', '')"
          aria-label="Очистити пошук"
        >
          ×
        </button>
      </label>
      <div class="list-tabs">
        <button :class="{ active: !favoritesOnly }" @click="emit('update:favoritesOnly', false)">
          Усі станції
        </button>
        <button :class="{ active: favoritesOnly }" @click="emit('update:favoritesOnly', true)">
          ☆ Обрані
          <span v-if="favorites.length">{{ favorites.length }}</span>
        </button>
      </div>
    </div>
    <div class="list-description">
      {{
        favoritesOnly
          ? 'Ваші збережені станції · усі області'
          : query.trim()
            ? 'Результати в усьому наборі даних'
            : 'У видимій області карти'
      }}
      <span v-if="loading" class="loading-dot"></span>
    </div>
    <div class="station-list" :aria-busy="loading">
      <div v-if="error && !favoritesOnly" class="state-card" role="alert">
        <strong>Дані тимчасово недоступні</strong>
        <p>{{ error }}</p>
        <button class="primary small" @click="emit('retry')">Спробувати ще раз</button>
      </div>
      <template v-if="loading && !stations.length && !favoritesOnly">
        <div v-for="n in 6" :key="n" class="skeleton-row">
          <i></i>
          <i></i>
        </div>
      </template>
      <div v-else-if="!visible.length && (!error || favoritesOnly)" class="state-card">
        <span class="empty-icon">⌕</span>
        <strong>{{ favoritesOnly ? 'Обраних станцій не знайдено' : 'Станцій не знайдено' }}</strong>
        <p>
          {{
            favoritesOnly
              ? 'Додайте станцію зірочкою або змініть пошук. Обрані зберігаються у вашому браузері.'
              : 'Змініть пошук або перемістіть карту до іншої області.'
          }}
        </p>
        <button class="text-button" @click="emit('reset')">Скинути фільтри</button>
      </div>
      <StationListItem
        v-for="station in visible"
        :key="station.id"
        :station="station"
        :selected="selected?.id === station.id"
        :favorite="favorites.includes(station.id)"
        @select="emit('select', $event)"
        @toggle-favorite="emit('toggle-favorite', $event)"
      />
      <button
        v-if="cursor && !favoritesOnly"
        class="load-more"
        :disabled="loading"
        @click="emit('load-more')"
      >
        {{
          loading
            ? 'Завантаження…'
            : `Показати ще · ${stations.length} із ${total.toLocaleString('uk-UA')}`
        }}
      </button>
    </div>
    <div class="sidebar-footer">
      <span class="teal-dot"></span>
      Оберіть станцію, щоб побачити динаміку
    </div>
  </aside>
</template>
