<script setup>
import { computed } from 'vue';
import { chartGeometry } from '../utils/chartGeometry.js';
import { formatLevel, formatDate } from '../utils/formatters.js';
const props = defineProps({ readings: { type: Array, required: true } });
const chart = computed(() => chartGeometry(props.readings));
</script>

<template>
  <div class="chart">
    <svg
      viewBox="0 0 570 190"
      role="img"
      :aria-label="`Графік рівня води за ${readings.length} днів, від ${formatLevel(chart.min)} до ${formatLevel(chart.max)} метра`"
    >
      <defs>
        <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2c9188" stop-opacity=".22" />
          <stop offset="100%" stop-color="#2c9188" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g v-for="t in [0, 0.5, 1]" :key="t">
        <line
          x1="40"
          x2="550"
          :y1="20 + t * 140"
          :y2="20 + t * 140"
          stroke="#e2eae8"
          stroke-dasharray="4 4"
        />
        <text x="0" :y="24 + t * 140">
          {{ formatLevel(chart.max - (chart.max - chart.min) * t) }}
        </text>
      </g>
      <polygon :points="`40,160 ${chart.points} 550,160`" fill="url(#waterFill)" />
      <polyline
        :points="chart.points"
        fill="none"
        stroke="#25877e"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <circle
        v-for="(m, i) in chart.values"
        :key="m.id"
        :cx="40 + (i / Math.max(chart.values.length - 1, 1)) * 510"
        :cy="160 - ((m.value - chart.min) / (chart.max - chart.min)) * 140"
        r="3.5"
        fill="#25877e"
        stroke="white"
        stroke-width="1.5"
      >
        <title>{{ formatDate(m.measuredAt, true) }}: {{ formatLevel(m.value) }} м</title>
      </circle>
      <text x="40" y="185">{{ formatDate(chart.values[0].measuredAt) }}</text>
      <text x="550" y="185" text-anchor="end">
        {{ formatDate(chart.values.at(-1).measuredAt) }}
      </text>
    </svg>
  </div>
</template>
