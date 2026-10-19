export async function request(path, signal, fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(path, { signal });
    if (response.ok) return response.json();
    if (response.status !== 503 || attempt === 2) throw new Error('Не вдалося отримати дані. Спробуйте ще раз.');
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 350 * 2 ** attempt);
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

export function chartGeometry(measurements) {
  const values = [...measurements].reverse();
  if (!values.length) return { points: '', min: 0, max: 1, values };
  const low = Math.min(...values.map(m => m.value));
  const high = Math.max(...values.map(m => m.value));
  const padding = Math.max((high - low) * .2, .05);
  const min = Math.max(0, low - padding), max = high + padding;
  return { min, max, values, points: values.map((m, i) => `${40 + i / Math.max(values.length - 1, 1) * 510},${160 - (m.value - min) / (max - min) * 140}`).join(' ') };
}
