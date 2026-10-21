export function chartGeometry(measurements) {
  const values = [...measurements].reverse();
  if (!values.length) return { points: '', min: 0, max: 1, values };
  const low = Math.min(...values.map((m) => m.value));
  const high = Math.max(...values.map((m) => m.value));
  const padding = Math.max((high - low) * 0.2, 0.05);
  const min = Math.max(0, low - padding),
    max = high + padding;
  return {
    min,
    max,
    values,
    points: values
      .map(
        (m, i) =>
          `${40 + (i / Math.max(values.length - 1, 1)) * 510},${160 - ((m.value - min) / (max - min)) * 140}`,
      )
      .join(' '),
  };
}
