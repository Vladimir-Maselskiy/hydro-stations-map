<script setup>
import { formatLevel, formatDate } from '../utils/formatters.js';
defineProps({
  readings: { type: Array, required: true },
  period: { type: Number, required: true },
});
</script>

<template>
  <div class="table-heading">
    <h3>Історія вимірювань</h3>
    <span>{{ readings.length }} записів</span>
  </div>
  <div class="measurements-table">
    <table>
      <thead>
        <tr>
          <th>Дата та час · Київ</th>
          <th>Рівень</th>
          <th>Зміна</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, i) in readings.slice(0, period)" :key="m.id">
          <td>{{ formatDate(m.measuredAt, true) }}</td>
          <td>
            <strong>{{ formatLevel(m.value) }} {{ m.unit }}</strong>
          </td>
          <td>
            {{
              readings[i + 1]
                ? `${m.value - readings[i + 1].value > 0 ? '+' : ''}${formatLevel(m.value - readings[i + 1].value)} м`
                : '—'
            }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
