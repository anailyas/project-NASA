import { SMART_SHIRT_SENSOR_CATALOG } from '../data/smartShirtDemoData.js';

const TELEMETRY_FIELDS = [
  { id: 'heart-rate', metric: 'heartRate', name: 'Heart Rate', unit: 'bpm', digits: 0 },
  { id: 'spo2', metric: 'spo2', name: 'SpO2', unit: '%', digits: 0 },
  { id: 'temperature', metric: 'temperature', name: 'Temperature', unit: '°C', digits: 1 },
  { id: 'respiratory-rate', metric: 'respiratoryRate', name: 'Respiratory Rate', unit: 'breaths/min', digits: 0 },
  { id: 'activity', metric: 'activity', name: 'Activity Index', unit: 'index', digits: 0 },
];

export function createDefaultSmartShirtConfig() {
  return {
    deviceName: '',
    deviceId: '',
    model: '',
    manufacturer: '',
    assignedAstronaut: '',
    firmwareVersion: '',
    temperatureUnit: 'C',
    syncPreference: 'Manual',
    sensors: Object.fromEntries(SMART_SHIRT_SENSOR_CATALOG.map((sensor) => [
      sensor.id,
      { configured: false, unit: '' },
    ])),
  };
}

function latestSyntheticValue(points = []) {
  return points
    .filter((point) => point.provenance === 'SYNTHETIC_DEMO' && point.value != null && point.t)
    .sort((left, right) => Date.parse(right.t) - Date.parse(left.t))[0] || null;
}

export function getDemoTelemetrySnapshot(bundle, enabled, temperatureUnit = 'C') {
  return TELEMETRY_FIELDS.map((field) => {
    const point = enabled ? latestSyntheticValue(bundle?.series?.[field.metric]) : null;
    let value = point?.value ?? null;
    let unit = field.unit;

    if (field.metric === 'temperature' && value != null && temperatureUnit === 'F') {
      value = (value * 9) / 5 + 32;
      unit = '°F';
    }

    return {
      ...field,
      value: value == null ? null : Number(value.toFixed(field.digits)),
      unit,
      timestamp: point?.t || null,
      provenance: point ? 'SYNTHETIC_DEMO' : null,
    };
  });
}

export function getReconnectPlaceholder() {
  return 'No connection was attempted: the shirt protocol and transport are not configured.';
}
