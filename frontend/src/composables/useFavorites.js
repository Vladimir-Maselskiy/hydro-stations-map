import { ref, computed } from 'vue';
export function useFavorites() {
  let favoritesInitial = [];
  try {
    favoritesInitial = JSON.parse(localStorage.getItem('hydro-favorites') || '[]');
  } catch {}
  const favorites = ref(
    Array.isArray(favoritesInitial) ? favoritesInitial.filter((x) => typeof x === 'string') : [],
  );
  let savedStations = {};
  try {
    const stored = JSON.parse(localStorage.getItem('hydro-saved-stations') || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) savedStations = stored;
  } catch {}
  const favoriteStations = ref(
    Object.fromEntries(
      Object.entries(savedStations).filter(
        ([id, s]) => favorites.value.includes(id) && s?.coordinates && s?.latestMeasurement,
      ),
    ),
  );
  function toggleFavorite(station) {
    const id = station.id;
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter((x) => x !== id);
      delete favoriteStations.value[id];
    } else {
      favorites.value = [...favorites.value, id];
      favoriteStations.value[id] = station;
    }
    try {
      localStorage.setItem('hydro-favorites', JSON.stringify(favorites.value));
      localStorage.setItem('hydro-saved-stations', JSON.stringify(favoriteStations.value));
    } catch {}
  }
  return {
    favorites,
    savedStations: computed(() => Object.values(favoriteStations.value)),
    toggleFavorite,
  };
}
