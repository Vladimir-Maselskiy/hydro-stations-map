export async function request(path, signal, fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(path, { signal });
    if (response.ok) return response.json();
    if (response.status !== 503 || attempt === 2)
      throw new Error('Не вдалося отримати дані. Спробуйте ще раз.');
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        },
        350 * 2 ** attempt,
      );
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
