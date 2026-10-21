<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { formatLevel, formatDate } from '../utils/formatters.js';
import { useMeasurements } from '../composables/useMeasurements.js';
import MeasurementChart from './MeasurementChart.vue';
import MeasurementTable from './MeasurementTable.vue';
const props = defineProps({ station: { type: Object, required: true }, favorite: Boolean });
const emit = defineEmits(['close', 'toggle-favorite']);
const closeButton = ref(null);
const period = ref(14);
const {
  readings,
  loading: detailLoading,
  error: detailError,
  reload: loadReadings,
} = useMeasurements(() => props.station.id);
const delta = computed(() =>
  readings.value.length > 1 ? readings.value[0].value - readings.value[1].value : null,
);
const previousFocus = document.activeElement;
function closeDetail() {
  emit('close');
}
onMounted(() => closeButton.value?.focus());
onUnmounted(() => {
  nextTick(() => {
    if (previousFocus?.isConnected) previousFocus.focus();
    else document.querySelector('.search-box input')?.focus();
  });
});
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const elements = [
    ...event.currentTarget.querySelectorAll(
      'button:not(:disabled), a[href], input, [tabindex="0"]',
    ),
  ];
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>

<template>
  <div class="detail-backdrop" @click.self="closeDetail">
    <section
      class="detail-panel"
      role="dialog"
      aria-modal="true"
      :aria-label="`Вимірювання: ${station.name}`"
      @keydown.esc="closeDetail"
      @keydown="trapFocus"
      tabindex="-1"
    >
      <header class="detail-header">
        <div>
          <p class="eyebrow">СТАНЦІЯ СПОСТЕРЕЖЕНЬ · {{ station.id }}</p>
          <h2>
            {{ station.name }}
            <button
              class="favorite inline"
              :aria-label="favorite ? 'Прибрати з обраних' : 'Додати до обраних'"
              :aria-pressed="favorite"
              @click="emit('toggle-favorite', station)"
            >
              {{ favorite ? '★' : '☆' }}
            </button>
          </h2>
          <p>
            р. {{ station.river }}
            <span>
              · {{ station.coordinates.latitude.toFixed(4) }}° N,
              {{ station.coordinates.longitude.toFixed(4) }}° E
            </span>
          </p>
        </div>
        <button
          ref="closeButton"
          class="close-button"
          aria-label="Закрити вимірювання"
          @click="closeDetail"
        >
          ×
        </button>
      </header>
      <div class="detail-content">
        <div class="reading-summary">
          <div>
            <span class="muted">Останній рівень води</span>
            <div class="big-number">
              {{ formatLevel(station.latestMeasurement.value) }}
              <span>м</span>
            </div>
            <span class="reading-date">
              {{ formatDate(station.latestMeasurement.measuredAt, true) }}
            </span>
          </div>
          <div v-if="delta !== null" class="delta" :class="{ falling: delta < 0 }">
            <strong>
              {{ delta > 0 ? '↗ +' : delta < 0 ? '↘ ' : '→ ' }}{{ formatLevel(delta) }} м
            </strong>
            <span>до попереднього виміру</span>
          </div>
        </div>
        <div v-if="detailLoading" class="detail-state" role="status">
          Завантажуємо історію вимірювань…
        </div>
        <div v-else-if="detailError" class="state-card" role="alert">
          <p>{{ detailError }}</p>
          <button class="primary" @click="loadReadings">Повторити запит</button>
        </div>
        <template v-else-if="readings.length">
          <div class="chart-heading">
            <h3>Динаміка рівня</h3>
            <div class="period-switch">
              <button
                v-for="days in [7, 14, 36]"
                :key="days"
                :class="{ active: period === days }"
                @click="period = days"
              >
                {{ days }} днів
              </button>
            </div>
          </div>
          <MeasurementChart :readings="readings.slice(0, period)" />
          <MeasurementTable :readings="readings" :period="period" />
        </template>
        <p v-else class="detail-state">Вимірювань ще немає.</p>
        <p class="detail-note">
          Демонстраційний набір. Висота рівня сама по собі не визначає небезпеку: пороги та відмітка
          нуля поста не надані.
        </p>
      </div>
    </section>
  </div>
</template>
