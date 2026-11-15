import { METRICS } from './metrics.js';

export const DEMO_NOW = Date.parse('2026-11-14T18:00:00.000Z');
export const DEMO_NOW_ISO = '2026-11-14T18:00:00.000Z';
export const PROVENANCE = 'SYNTHETIC_DEMO';
export const SYNTHETIC_SOURCE = 'Onboard synthetic generator';

const HOUR = 60 * 60 * 1000;

const HOURLY_HEADERS = [
  'sample_id',
  'timestamp',
  'heart_rate',
  'spo2',
  'systolic_mmHg',
  'diastolic_mmHg',
  'temperature_C',
  'respiratory_rate',
  'activity_index',
  'radiation_uGy_h',
  'provenance',
  'data_class',
];

const DAILY_HEADERS = [
  'sample_id',
  'timestamp',
  'sleep_hours',
  'muscle_health_index',
  'provenance',
  'data_class',
];

function isoHoursAgo(hoursAgo) {
  return new Date(DEMO_NOW - hoursAgo * HOUR).toISOString();
}

function round(value, digits) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function sampleId(prefix, iso) {
  return `SYN-${prefix}-${iso.slice(0, 13).replace(/[-T:]/g, '')}`;
}

function point(metric, hoursAgo, value, extra = {}) {
  const t = isoHoursAgo(hoursAgo);
  return {
    t,
    label: `${t.slice(5, 10)} ${t.slice(11, 16)}`,
    value,
    sampleId: sampleId(metric.toUpperCase(), t),
    provenance: PROVENANCE,
    source: SYNTHETIC_SOURCE,
    dataClass: 'Synthetic Demo',
    hasTimestamp: true,
    ...extra,
  };
}

function baseHeart(hoursAgo) {
  return round(70 + Math.sin(hoursAgo / 6) * 3, 0);
}

function baseSpo2() {
  return 98;
}

function baseSystolic(hoursAgo) {
  return round(118 + Math.sin(hoursAgo / 7) * 4, 0);
}

function baseTemperature(hoursAgo) {
  return round(36.6 + Math.sin(hoursAgo / 9) * 0.15, 1);
}

function baseRespiratory(hoursAgo) {
  return round(14 + Math.sin(hoursAgo / 5) * 1.2, 0);
}

function baseActivity(hoursAgo) {
  return round(55 + Math.sin(hoursAgo / 4) * 12, 0);
}

function baseRadiation(hoursAgo) {
  const wave = Math.sin(hoursAgo / 3) * 0.5 + 0.5;
  return round(0.45 + wave * 0.5, 2);
}

function diastolicFor(hoursAgo, systolic) {
  if (hoursAgo === 14) return 96;
  if (hoursAgo === 90) return 104;
  return round(74 + (systolic - 118) * 0.3, 0);
}

function sleepForDay(day) {
  if (day === 1) return 4.6;
  if (day === 4) return 3.6;
  return round(7.1 + Math.sin(day) * 0.4, 1);
}

function muscleForDay(day) {
  if (day === 6) return 46;
  if (day === 12) return 33;
  return round(78 - day * 0.15 + Math.sin(day) * 1.5, 0);
}

function build() {
  const series = Object.fromEntries(METRICS.map((metric) => [metric.key, []]));
  const hourlyRows = [];

  for (let hoursAgo = 24 * 30 - 1; hoursAgo >= 0; hoursAgo -= 1) {
    const heart = hoursAgo === 6 ? 124 : hoursAgo === 28 ? 138 : baseHeart(hoursAgo);
    const spo2 = hoursAgo === 2 ? 94 : hoursAgo === 3 ? 90 : baseSpo2();
    const systolic = hoursAgo === 14 ? 151 : hoursAgo === 90 ? 166 : baseSystolic(hoursAgo);
    const diastolic = diastolicFor(hoursAgo, systolic);
    const temperature = hoursAgo === 10 ? 37.8 : hoursAgo === 120 ? 38.8 : baseTemperature(hoursAgo);
    const respiratory = hoursAgo === 16 ? 24 : hoursAgo === 200 ? 31 : baseRespiratory(hoursAgo);
    const activity = hoursAgo === 40 ? 9 : baseActivity(hoursAgo);
    const radiation = hoursAgo === 0 ? 5.6 : hoursAgo === 8 ? 11.5 : baseRadiation(hoursAgo);
    const t = isoHoursAgo(hoursAgo);

    series.heartRate.push(point('heartRate', hoursAgo, heart));
    series.spo2.push(point('spo2', hoursAgo, spo2));
    series.bloodPressure.push(point('bloodPressure', hoursAgo, systolic, { systolic, diastolic }));
    series.temperature.push(point('temperature', hoursAgo, temperature));
    series.respiratoryRate.push(point('respiratoryRate', hoursAgo, respiratory));
    series.activity.push(point('activity', hoursAgo, activity));
    series.radiation.push(point('radiation', hoursAgo, radiation));

    hourlyRows.push({
      sample_id: sampleId('HOURLY', t),
      timestamp: t,
      heart_rate: heart,
      spo2,
      systolic_mmHg: systolic,
      diastolic_mmHg: diastolic,
      temperature_C: temperature,
      respiratory_rate: respiratory,
      activity_index: activity,
      radiation_uGy_h: radiation,
      provenance: PROVENANCE,
      data_class: 'Synthetic Demo',
    });
  }

  const dailyRows = [];
  for (let day = 29; day >= 0; day -= 1) {
    const hoursAgo = day * 24;
    const sleep = sleepForDay(day);
    const muscle = muscleForDay(day);
    const t = isoHoursAgo(hoursAgo);
    series.sleep.push(point('sleep', hoursAgo, sleep));
    series.muscle.push(point('muscle', hoursAgo, muscle));
    dailyRows.push({
      sample_id: sampleId('DAILY', t),
      timestamp: t,
      sleep_hours: sleep,
      muscle_health_index: muscle,
      provenance: PROVENANCE,
      data_class: 'Synthetic Demo',
    });
  }

  const hourlyDataset = {
    id: 'virtual-synthetic-hourly',
    name: 'Synthetic hourly vitals',
    datasetId: 'SYNTHETIC-HOURLY',
    source: SYNTHETIC_SOURCE,
    category: 'Synthetic Demo',
    organism: 'Fictional demonstration subject',
    description: 'Browser-generated hourly vitals. Every row is SYNTHETIC_DEMO.',
    fileFormat: 'In-memory table',
    filename: null,
    headers: HOURLY_HEADERS,
    rows: hourlyRows,
    virtual: true,
    status: 'Generated in browser',
    confirmedStatement: 'Single class: Synthetic Demo',
  };

  const dailyDataset = {
    id: 'virtual-synthetic-daily',
    name: 'Synthetic daily recovery indexes',
    datasetId: 'SYNTHETIC-DAILY',
    source: SYNTHETIC_SOURCE,
    category: 'Synthetic Demo',
    organism: 'Fictional demonstration subject',
    description: 'Browser-generated nightly sleep and muscle index. SYNTHETIC_DEMO only.',
    fileFormat: 'In-memory table',
    filename: null,
    headers: DAILY_HEADERS,
    rows: dailyRows,
    virtual: true,
    status: 'Generated in browser',
    confirmedStatement: 'Single class: Synthetic Demo',
  };

  return { series, hourlyRows, dailyRows, hourlyDataset, dailyDataset, now: DEMO_NOW };
}

let cache;

export function getDemoBundle() {
  if (!cache) cache = build();
  return cache;
}
