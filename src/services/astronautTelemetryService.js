export const TELEMETRY_REFRESH_MS = 5000;

const STARTING_READINGS = {
  'AST-001': { heartRate: 69, spo2: 98.1, systolic: 114, diastolic: 73, temperatureC: 36.7, breathingRate: 14, radiationRate: 0.08, cumulativeDose: 1.2 },
  'AST-002': { heartRate: 72, spo2: 97.7, systolic: 118, diastolic: 76, temperatureC: 36.8, breathingRate: 15, radiationRate: 0.09, cumulativeDose: 1.4 },
  'AST-003': { heartRate: 66, spo2: 98.4, systolic: 111, diastolic: 71, temperatureC: 36.6, breathingRate: 13, radiationRate: 0.07, cumulativeDose: 1.1 },
  'AST-004': { heartRate: 74, spo2: 97.9, systolic: 121, diastolic: 78, temperatureC: 36.9, breathingRate: 16, radiationRate: 0.1, cumulativeDose: 1.6 },
};

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createSyntheticAstronautTelemetry(astronaut, sequence, now = new Date()) {
  const baseline = STARTING_READINGS[astronaut.id];
  if (!baseline) {
    throw new Error(`No synthetic telemetry profile is defined for ${astronaut.id}.`);
  }

  const crewIndex = Number(astronaut.id.slice(-1)) - 1;
  const phase = sequence * 0.62 + crewIndex * 1.17;
  const activityIntensity = round(clamp(42 + 32 * Math.sin(phase * 0.73), 0, 100));

  return {
    astronautId: astronaut.id,
    sequence,
    timestamp: now.toISOString(),
    provenance: 'SYNTHETIC_DEMO',
    heartRate: round(baseline.heartRate + 2.7 * Math.sin(phase) + activityIntensity * 0.055),
    spo2: round(baseline.spo2 + 0.55 * Math.sin(phase * 0.41), 1),
    systolic: round(baseline.systolic + 2.6 * Math.sin(phase * 0.57)),
    diastolic: round(baseline.diastolic + 1.7 * Math.sin(phase * 0.51)),
    temperatureC: round(baseline.temperatureC + 0.08 * Math.sin(phase * 0.32), 2),
    breathingRate: round(baseline.breathingRate + 0.9 * Math.sin(phase * 0.66)),
    radiationRate: round(baseline.radiationRate + 0.018 * Math.sin(phase * 0.3), 3),
    cumulativeDose: round(baseline.cumulativeDose + sequence * 0.0002, 3),
    activityIntensity,
    musclePerformanceScore: round(clamp(astronaut.baselineFitness + 1.6 * Math.sin(phase * 0.24), 0, 100)),
    sleepDurationHours: round(astronaut.id === 'AST-004' ? 6.2 : 7.2 + 0.45 * Math.sin(phase * 0.12), 1),
    sleepQualityScore: round(clamp(76 + 5 * Math.sin(phase * 0.16 + crewIndex), 0, 100)),
    cabinOxygenPercent: round(20.95 + 0.025 * Math.sin(phase * 0.18), 2),
    cabinTemperatureC: round(22 + 0.3 * Math.sin(phase * 0.21), 1),
    cabinPressureKPa: round(101.3 + 0.18 * Math.sin(phase * 0.17), 2),
    cabinHumidityPercent: round(45 + 2.5 * Math.sin(phase * 0.15), 1),
  };
}
