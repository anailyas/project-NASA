const RANK = { unavailable: 0, normal: 1, warning: 2, critical: 3 };

export const STATUS_META = {
  normal: { label: 'Normal', chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  warning: { label: 'Warning', chip: 'border-orange-400/35 bg-orange-400/10 text-orange-300' },
  critical: { label: 'Critical', chip: 'border-red-400/40 bg-red-400/10 text-red-300' },
  unavailable: { label: 'Unavailable', chip: 'border-white/15 bg-white/5 text-slate-300' },
};

export function evaluate(metricKey, value, thresholds) {
  if (value == null || value === '') return 'unavailable';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unavailable';
  const rule = thresholds?.[metricKey];
  if (!rule) return 'unavailable';
  if (rule.critLow != null && numeric <= Number(rule.critLow)) return 'critical';
  if (rule.critHigh != null && numeric >= Number(rule.critHigh)) return 'critical';
  if (rule.warnLow != null && numeric <= Number(rule.warnLow)) return 'warning';
  if (rule.warnHigh != null && numeric >= Number(rule.warnHigh)) return 'warning';
  return 'normal';
}

export function worseStatus(left, right) {
  return RANK[left] >= RANK[right] ? left : right;
}

export function statusForPoint(metricKey, point, thresholds) {
  if (!point) return 'unavailable';
  if (metricKey === 'bloodPressure') {
    if (point.systolic == null || point.diastolic == null) return 'unavailable';
    return worseStatus(
      evaluate('systolic', point.systolic, thresholds),
      evaluate('diastolic', point.diastolic, thresholds),
    );
  }
  if (metricKey === 'temperature') {
    if (point.unit === '°F') {
      if (point.value == null || !Number.isFinite(Number(point.value))) return 'unavailable';
      return evaluate('temperature', ((Number(point.value) - 32) * 5) / 9, thresholds);
    }
    if (point.unit !== '°C' && point.provenance !== 'SYNTHETIC_DEMO') return 'unavailable';
  }
  return evaluate(metricKey, point.value, thresholds);
}

export function describeRule(metricKey, thresholds) {
  const rule = thresholds?.[metricKey];
  if (!rule) return 'No demo threshold is configured.';
  const parts = [];
  if (rule.critLow != null) parts.push(`critical at or below ${rule.critLow}`);
  if (rule.warnLow != null) parts.push(`warning at or below ${rule.warnLow}`);
  if (rule.warnHigh != null) parts.push(`warning at or above ${rule.warnHigh}`);
  if (rule.critHigh != null) parts.push(`critical at or above ${rule.critHigh}`);
  return parts.length ? `Demo threshold: ${parts.join(', ')}.` : 'No demo threshold is configured.';
}
