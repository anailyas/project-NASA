import { DEMO_NOW_ISO } from '../data/demoData.js';
import { METRICS, METRIC_MAP } from '../data/metrics.js';
import { describeRule, statusForPoint } from './status.js';

export const RANGES = [
  { id: '24h', label: '24 hours', hours: 24 },
  { id: '7d', label: '7 days', hours: 24 * 7 },
  { id: '30d', label: '30 days', hours: 24 * 30 },
];

export function emptySeries() {
  return Object.fromEntries(METRICS.map((metric) => [metric.key, []]));
}

export function filterByRange(points, rangeId, referenceMs) {
  if (!referenceMs) return [];
  const range = RANGES.find((item) => item.id === rangeId) || RANGES[0];
  const min = referenceMs - range.hours * 60 * 60 * 1000;
  return points.filter((point) => {
    const time = Date.parse(point.t);
    return !Number.isNaN(time) && time >= min && time <= referenceMs;
  });
}

export function hasNumeric(points, metricKey) {
  return (points || []).some((point) => {
    if (metricKey === 'bloodPressure') {
      return Number.isFinite(point.systolic) || Number.isFinite(point.diastolic);
    }
    return Number.isFinite(point.value);
  });
}

export function windowMean(points, referenceMs, startHours, endHours, picker) {
  if (!referenceMs) return null;
  const min = referenceMs - endHours * 60 * 60 * 1000;
  const max = referenceMs - startHours * 60 * 60 * 1000;
  const values = [];
  for (const point of points || []) {
    const time = Date.parse(point.t);
    if (Number.isNaN(time) || time <= min || time > max) continue;
    const value = picker(point);
    if (Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildMeasurementAlerts(series, thresholds, idPrefix = 'syn') {
  const alerts = [];
  for (const metric of METRICS) {
    for (const point of series?.[metric.key] || []) {
      const severity = statusForPoint(metric.key, point, thresholds);
      if (severity !== 'warning' && severity !== 'critical') continue;
      const pointUnit = point.unit || metric.unit;
      const valueText = metric.key === 'bloodPressure'
        ? `${point.systolic}/${point.diastolic} ${metric.unit}`
        : `${point.value} ${pointUnit}`;
      const ruleText = metric.key === 'bloodPressure'
        ? `${describeRule('systolic', thresholds)} ${describeRule('diastolic', thresholds)}`
        : describeRule(metric.key, thresholds);
      alerts.push({
        id: `${idPrefix}-${metric.key}-${point.t}`,
        kind: 'measurement',
        severity,
        title: `${metric.label} ${severity}`,
        detail: `${valueText} is outside the configured demo band. ${ruleText} Sample ${point.sampleId || 'not provided'}.`,
        parameter: metric.label,
        metricKey: metric.key,
        timestamp: point.t,
        provenance: point.provenance || 'IMPORTED',
        dataClass: point.dataClass || null,
        source: point.source || 'Selected dataset',
        sampleId: point.sampleId || null,
        valueText,
      });
    }
  }
  alerts.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  return alerts;
}

export function buildNoticeAlerts(demoStream) {
  return [
    demoStream
      ? {
          id: 'notice-demo-on',
          kind: 'notice',
          severity: 'normal',
          title: 'Synthetic demonstration stream is on',
          detail: 'Vital signs in the synthetic source are generated samples. They are not astronaut measurements.',
          parameter: 'Data source',
          timestamp: DEMO_NOW_ISO,
          provenance: 'SYNTHETIC_DEMO',
          dataClass: 'Synthetic Demo',
          source: 'Onboard synthetic generator',
          sampleId: null,
        }
      : {
          id: 'notice-demo-off',
          kind: 'notice',
          severity: 'normal',
          title: 'No live measurement stream',
          detail: 'The synthetic stream is off. Import a file or enable the demo stream in Settings. Missing cells stay empty.',
          parameter: 'Data source',
          timestamp: DEMO_NOW_ISO,
          provenance: 'UNAVAILABLE',
          dataClass: null,
          source: 'Settings',
          sampleId: null,
        },
    {
      id: 'notice-radlab',
      kind: 'notice',
      severity: 'normal',
      title: 'NASA RadLab is not streaming',
      detail: 'No RadLab query has been run. Radiation numbers in the synthetic source are not instrument telemetry.',
      parameter: 'Radiation',
      timestamp: DEMO_NOW_ISO,
      provenance: 'UNAVAILABLE',
      dataClass: null,
      source: 'Catalog only',
      sampleId: null,
    },
  ];
}

export function metricLabel(key) {
  return METRIC_MAP[key]?.label || key;
}
