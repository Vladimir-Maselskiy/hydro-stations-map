const levelFormatter = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const shortDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Europe/Kyiv',
});
const fullDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
  timeZone: 'Europe/Kyiv',
});
export const formatLevel = (value) => levelFormatter.format(value);
export const formatDate = (value, full = false) =>
  (full ? fullDateFormatter : shortDateFormatter).format(new Date(value));
