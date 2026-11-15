export const DEFAULT_THRESHOLDS = {
  heartRate: { warnLow: 55, warnHigh: 100, critLow: 45, critHigh: 130 },
  spo2: { warnLow: 95, critLow: 92 },
  systolic: { warnLow: 90, warnHigh: 140, critLow: 80, critHigh: 160 },
  diastolic: { warnLow: 60, warnHigh: 90, critLow: 50, critHigh: 100 },
  temperature: { warnLow: 36, warnHigh: 37.5, critLow: 35.5, critHigh: 38.5 },
  respiratoryRate: { warnLow: 10, warnHigh: 20, critLow: 8, critHigh: 28 },
  sleep: { warnLow: 5, critLow: 4 },
  activity: { warnLow: 15 },
  radiation: { warnHigh: 5, critHigh: 10 },
  muscle: { warnLow: 50, critLow: 35 },
};

export const THRESHOLD_FIELDS = [
  { key: 'heartRate', label: 'Heart rate', unit: 'BPM', bounds: ['critLow', 'warnLow', 'warnHigh', 'critHigh'] },
  { key: 'spo2', label: 'SpO2', unit: '%', bounds: ['critLow', 'warnLow'] },
  { key: 'systolic', label: 'Systolic pressure', unit: 'mmHg', bounds: ['critLow', 'warnLow', 'warnHigh', 'critHigh'] },
  { key: 'diastolic', label: 'Diastolic pressure', unit: 'mmHg', bounds: ['critLow', 'warnLow', 'warnHigh', 'critHigh'] },
  { key: 'temperature', label: 'Temperature', unit: '°C', bounds: ['critLow', 'warnLow', 'warnHigh', 'critHigh'] },
  { key: 'respiratoryRate', label: 'Respiratory rate', unit: 'breaths/min', bounds: ['critLow', 'warnLow', 'warnHigh', 'critHigh'] },
  { key: 'sleep', label: 'Sleep duration', unit: 'h', bounds: ['critLow', 'warnLow'] },
  { key: 'activity', label: 'Activity index', unit: 'index', bounds: ['warnLow'] },
  { key: 'radiation', label: 'Radiation dose rate', unit: 'µGy/h', bounds: ['warnHigh', 'critHigh'] },
  { key: 'muscle', label: 'Muscle index', unit: 'index', bounds: ['critLow', 'warnLow'] },
];

export const BOUND_LABELS = {
  critLow: 'Critical low',
  warnLow: 'Warning low',
  warnHigh: 'Warning high',
  critHigh: 'Critical high',
};

export const DEFAULT_SETTINGS = {
  accent: 'cyan',
  reduceMotion: false,
  density: 'comfortable',
  temperatureUnit: 'C',
  demoStream: true,
  apiBaseUrl: '',
  notifications: {
    critical: true,
    warning: true,
    normal: true,
  },
  ai: {
    endpoint: '',
    model: '',
  },
  thresholds: DEFAULT_THRESHOLDS,
};

export function createDefaultSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

export function mergeSettings(base, patch = {}) {
  return {
    ...base,
    ...patch,
    notifications: { ...base.notifications, ...(patch.notifications || {}) },
    ai: { ...base.ai, ...(patch.ai || {}) },
    thresholds: { ...base.thresholds, ...(patch.thresholds || {}) },
  };
}

export function validateThresholds(thresholds) {
  const errors = {};
  for (const [key, rule] of Object.entries(thresholds)) {
    const numbers = ['critLow', 'warnLow', 'warnHigh', 'critHigh'].filter((bound) => rule[bound] != null);
    if (numbers.some((bound) => !Number.isFinite(Number(rule[bound])))) {
      errors[key] = 'Enter a number for every filled bound.';
      continue;
    }
    const { warnLow, warnHigh, critLow, critHigh } = rule;
    if (warnLow != null && warnHigh != null && !(Number(warnLow) < Number(warnHigh))) {
      errors[key] = 'Warning low must be below warning high.';
    } else if (critLow != null && warnLow != null && !(Number(critLow) < Number(warnLow))) {
      errors[key] = 'Critical low must be below warning low.';
    } else if (critHigh != null && warnHigh != null && !(Number(critHigh) > Number(warnHigh))) {
      errors[key] = 'Critical high must be above warning high.';
    } else if (critLow != null && critHigh != null && !(Number(critLow) < Number(critHigh))) {
      errors[key] = 'Critical low must be below critical high.';
    }
  }
  return errors;
}
