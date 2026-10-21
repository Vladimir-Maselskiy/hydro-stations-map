<script setup>
import { formatLevel } from '../utils/formatters.js';
defineProps({ station: { type: Object, required: true }, selected: Boolean, favorite: Boolean });
const emit = defineEmits(['select', 'toggle-favorite']);
</script>

<template>
  <article class="station-row" :class="{ selected: selected }">
    <button class="station-select" @click="emit('select', station)">
      <span class="station-symbol">≈</span>
      <span class="station-copy">
        <strong>{{ station.name }}</strong>
        <span>р. {{ station.river }}</span>
      </span>
      <span class="station-value">
        {{ formatLevel(station.latestMeasurement.value) }}
        <small>м</small>
        <span>рівень води</span>
      </span>
    </button>
    <button
      class="favorite"
      :class="{ saved: favorite }"
      :aria-label="`${favorite ? 'Прибрати з обраних' : 'Додати до обраних'}: ${station.name}`"
      :aria-pressed="favorite"
      @click="emit('toggle-favorite', station)"
    >
      {{ favorite ? '★' : '☆' }}
    </button>
  </article>
</template>
