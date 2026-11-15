export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function formatStamp(iso) {
  if (!iso) return 'No timestamp';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatNumber(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function presentTemperature(celsius, unit) {
  if (celsius == null || !Number.isFinite(Number(celsius))) return null;
  if (unit === 'F') {
    return {
      text: ((Number(celsius) * 9) / 5 + 32).toFixed(1),
      unit: '°F',
      stored: `${Number(celsius).toFixed(1)} °C`,
    };
  }
  return { text: Number(celsius).toFixed(1), unit: '°C', stored: null };
}

export function fileSize(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
