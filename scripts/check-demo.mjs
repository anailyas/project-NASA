import assert from 'node:assert/strict';
import { getDemoBundle, PROVENANCE } from '../src/data/demoData.js';
import { ASTRONAUT_ROSTER } from '../src/data/astronautRoster.js';
import { createDefaultSettings, validateThresholds } from '../src/data/thresholds.js';
import {
  extractMetricSeries, matrixToTable, parseCsv, parseNumeric, parseSpreadsheetFile, reviewImport,
} from '../src/services/datasetService.js';
import { buildMeasurementAlerts } from '../src/utils/series.js';
import { evaluate, statusForPoint } from '../src/utils/status.js';
import { createSyntheticAstronautTelemetry, TELEMETRY_REFRESH_MS } from '../src/services/astronautTelemetryService.js';
import { detectCrisisSignal, respondToPsychologicalMessage } from '../src/services/psychologicalAssistantService.js';
import {
  createDefaultSmartShirtConfig, getDemoTelemetrySnapshot, getReconnectPlaceholder,
} from '../src/services/smartShirtService.js';

const demo = getDemoBundle();
assert.equal(demo.hourlyRows.length, 24 * 30, 'demo should contain 30 days of hourly records');
assert.equal(demo.dailyRows.length, 30, 'demo should contain 30 daily records');
assert.ok(demo.hourlyRows.every((row) => row.provenance === PROVENANCE));
assert.ok(demo.dailyRows.every((row) => row.data_class === 'Synthetic Demo'));

const table = matrixToTable(parseCsv([
  'sample_id,timestamp,heart_rate,spo2,provenance,data_class',
  'SAMPLE-1,2026-11-14T12:00:00Z,72,98,IMPORTED,Ground-Based Human',
  'SAMPLE-2,2026-11-14T13:00:00Z,,97,IMPORTED,Ground-Based Human',
].join('\n')));
assert.equal(table.rows.length, 2);
assert.equal(parseNumeric(table.rows[1].heart_rate), null, 'blank measurements must stay missing, not become zero');

const importReview = reviewImport(table, {
  category: 'Ground-Based Human',
  name: 'Local test dataset',
  source: 'Local check fixture',
  confirmed: true,
});
assert.deepEqual(importReview.errors, []);
assert.equal(importReview.summary.missingCells, 1);

const extracted = extractMetricSeries(table.rows, {
  source: 'Local check fixture',
  category: 'Ground-Based Human',
});
assert.equal(extracted.series.heartRate.length, 2);
assert.equal(extracted.series.heartRate[1].value, null);
assert.equal(extracted.series.heartRate[1].provenance, 'IMPORTED');
assert.equal(extracted.referenceMs, Date.parse('2026-11-14T13:00:00Z'));

const temperatureSettings = createDefaultSettings().thresholds;
const fahrenheitPoint = extractMetricSeries([
  { sample_id: 'TEMP-F', timestamp: '2026-11-14T13:00:00Z', temperature_f: 100.4 },
], { source: 'Local check fixture', category: 'Ground-Based Human' }).series.temperature[0];
assert.equal(fahrenheitPoint.unit, '°F');
assert.equal(statusForPoint('temperature', fahrenheitPoint, temperatureSettings), 'warning');
assert.equal(statusForPoint('temperature', { ...fahrenheitPoint, value: null }, temperatureSettings), 'unavailable');
assert.equal(buildMeasurementAlerts({ temperature: [fahrenheitPoint] }, temperatureSettings)[0].valueText, '100.4 °F');
const unknownUnitPoint = extractMetricSeries([
  { sample_id: 'TEMP-UNKNOWN', timestamp: '2026-11-14T14:00:00Z', temperature: 37 },
], { source: 'Local check fixture', category: 'Ground-Based Human' }).series.temperature[0];
assert.equal(unknownUnitPoint.unit, null);
assert.equal(statusForPoint('temperature', unknownUnitPoint, temperatureSettings), 'unavailable');

const XLSX = await import('@e965/xlsx');
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['sample_id', 'heart_rate'],
  ['XLSX-1', 71],
]), 'vitals');
const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
const parsedWorkbook = await parseSpreadsheetFile({
  name: 'fixture.xlsx',
  arrayBuffer: async () => xlsxBuffer,
});
assert.equal(parsedWorkbook.sheetName, 'vitals');
assert.equal(parsedWorkbook.rows[0].heart_rate, '71');

const mixedClassTable = matrixToTable(parseCsv([
  'sample_id,data_class,value',
  'A,Ground-Based Human,1',
  'B,Animal Research,2',
].join('\n')));
const mixedReview = reviewImport(mixedClassTable, {
  category: 'Ground-Based Human',
  name: 'Mixed class',
  source: 'Local check fixture',
  confirmed: true,
});
assert.ok(mixedReview.errors.some((error) => error.includes('more than one data class')));

assert.equal(evaluate('heartRate', 130, createDefaultSettings().thresholds), 'critical');
assert.deepEqual(validateThresholds(createDefaultSettings().thresholds), {});

assert.equal(detectCrisisSignal('I might hurt myself'), true);
assert.equal(detectCrisisSignal('I do not feel safe'), true);
assert.equal(detectCrisisSignal('I miss my family'), false);
const supportReply = await respondToPsychologicalMessage('I miss my family');
assert.equal(supportReply.emergency, false);
assert.match(supportReply.content, /far from the people/i);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/psychological-support/chat');
    assert.equal(JSON.parse(options.body).message, 'I feel worried');
    return {
      ok: true,
      json: async () => ({
        success: true,
        modelLoaded: true,
        emergency: false,
        emotion: 'fear',
        emotionLabel: 'Fear',
        emoji: '😰',
        confidence: 83.1,
        allScores: { fear: 83.1 },
        response: 'It may be worry. What feels uncertain?',
        suggestions: [],
      }),
    };
  };
  const modelReply = await respondToPsychologicalMessage('I feel worried');
  assert.equal(modelReply.modelPowered, true);
  assert.equal(modelReply.emotion, 'fear');
  assert.equal(modelReply.confidence, 83.1);
} finally {
  globalThis.fetch = originalFetch;
}
const crisisReply = await respondToPsychologicalMessage('I want to end my life');
assert.equal(crisisReply.emergency, true);
assert.match(crisisReply.content, /mission emergency protocol/i);

assert.deepEqual(ASTRONAUT_ROSTER.map((profile) => profile.id), ['AST-001', 'AST-002', 'AST-003', 'AST-004']);
assert.equal(TELEMETRY_REFRESH_MS, 5000);
const firstReading = createSyntheticAstronautTelemetry(ASTRONAUT_ROSTER[0], 0, new Date('2026-11-14T18:00:00Z'));
const nextReading = createSyntheticAstronautTelemetry(ASTRONAUT_ROSTER[0], 1, new Date('2026-11-14T18:00:05Z'));
assert.equal(firstReading.provenance, 'SYNTHETIC_DEMO');
assert.notEqual(firstReading.heartRate, nextReading.heartRate, 'crew telemetry should update each refresh');
assert.equal(nextReading.timestamp, '2026-11-14T18:00:05.000Z');

const shirtConfig = createDefaultSmartShirtConfig();
assert.equal(Object.values(shirtConfig.sensors).filter((sensor) => sensor.configured).length, 0);
assert.ok(Object.values(shirtConfig.sensors).every((sensor) => sensor.unit === ''));
const shirtTelemetry = getDemoTelemetrySnapshot(demo, true);
assert.ok(shirtTelemetry.every((item) => item.provenance === 'SYNTHETIC_DEMO' && item.value != null));
assert.ok(getDemoTelemetrySnapshot(demo, false).every((item) => item.value == null));
assert.match(getReconnectPlaceholder(), /No connection was attempted/);

console.log('Demo data, five-second crew telemetry, provenance, thresholds, support safety, and shirt demo boundaries passed.');
