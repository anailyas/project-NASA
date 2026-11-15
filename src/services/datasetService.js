const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', 'undefined']);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 8000;
const SKIP_NORMALIZATION = /npq|log2|log_2|z_?score|normalized|ipc/;

const CLASS_ALIASES = {
  synthetic_demo: 'Synthetic Demo',
  synthetic: 'Synthetic Demo',
  nasa_spaceflight: 'NASA Spaceflight',
  spaceflight: 'NASA Spaceflight',
  ground_based_human: 'Ground-Based Human',
  ground_based: 'Ground-Based Human',
  animal_research: 'Animal Research',
  animal: 'Animal Research',
};

export function isMissing(value) {
  if (value == null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return MISSING.has(String(value).trim().toLowerCase());
}

export function parseNumeric(value) {
  if (isMissing(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function canonicalClass(value) {
  if (isMissing(value)) return null;
  const key = normHeader(value);
  return CLASS_ALIASES[key] || String(value).trim();
}

export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const matrix = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    matrix.push(row);
  }
  return matrix;
}

export function matrixToTable(matrix, sheetName = 'Sheet') {
  const occupied = (matrix || []).filter((row) => Array.isArray(row) && row.some((cell) => !isMissing(cell)));
  if (!occupied.length) {
    return { sheetName, headers: [], rows: [], duplicateHeaders: [], blankHeaders: false, blocked: true };
  }
  const width = Math.max(...occupied.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => {
    const cell = occupied[0][index];
    return isMissing(cell) ? '' : String(cell).trim();
  });
  const duplicateHeaders = [...new Set(headers.filter((header, index) => header && headers.indexOf(header) !== index))];
  const blankHeaders = headers.some((header) => !header);
  if (duplicateHeaders.length || blankHeaders) {
    return { sheetName, headers: headers.filter(Boolean), rows: [], duplicateHeaders, blankHeaders, blocked: true };
  }
  const rows = occupied.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  }).filter((record) => Object.values(record).some((cell) => !isMissing(cell)));
  return { sheetName, headers, rows, duplicateHeaders, blankHeaders, blocked: false };
}

export function checkFile(file) {
  const errors = [];
  if (!file) return ['Choose a CSV, XLSX, or XLS file.'];
  if (file.size === 0) errors.push('The file is empty. Nothing was imported.');
  if (file.size > MAX_BYTES) errors.push('Files larger than 12 MB are left for the FastAPI importer. This file was not read.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) errors.push('Only CSV, XLSX, and XLS files can be validated here.');
  if (file.type && /image|video|audio|pdf/.test(file.type)) errors.push('This file type is not a spreadsheet. Nothing was imported.');
  return errors;
}

export async function parseSpreadsheetFile(file) {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'csv') {
    return matrixToTable(parseCsv(await file.text()), 'CSV');
  }
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook has no sheets. Nothing was imported.');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: false });
  const table = matrixToTable(matrix, sheetName);
  table.sheetNames = workbook.SheetNames;
  return table;
}

function findHeader(headers, aliases) {
  const lookup = new Map(headers.map((header) => [normHeader(header), header]));
  for (const alias of aliases) {
    if (lookup.has(alias)) return lookup.get(alias);
  }
  return null;
}

export function reviewImport(table, form) {
  const errors = [];
  const warnings = [];
  if (!table) return { errors: ['No file is loaded.'], warnings, summary: null };
  if (table.blankHeaders) errors.push('A header cell is blank. Columns were not renamed. Nothing was imported.');
  if (table.duplicateHeaders?.length) {
    errors.push(`Duplicate column names (${table.duplicateHeaders.join(', ')}). They were not merged. Nothing was imported.`);
  }
  if (!table.headers.length) errors.push('No header row was found. Nothing was imported.');
  if (!table.rows.length && !table.blocked) errors.push('The file has no data rows. Nothing was imported.');
  if (table.rows.length > MAX_ROWS) {
    errors.push(`Found ${table.rows.length} data rows. This browser session stops at ${MAX_ROWS} rows. Nothing was imported.`);
  }

  const classHeader = findHeader(table.headers, ['data_class', 'dataclass', 'category']);
  const classes = classHeader
    ? [...new Set(table.rows.map((row) => canonicalClass(row[classHeader])).filter(Boolean))]
    : [];
  if (classes.length > 1) {
    errors.push(`This file contains more than one data class (${classes.join(', ')}). Split human, animal, spaceflight, and synthetic rows before import.`);
  }
  if (classes.length === 1 && form.category && classes[0] !== form.category) {
    errors.push(`The data_class column says ${classes[0]}, which does not match the selected class ${form.category}. Nothing was imported.`);
  }

  const headerBlob = table.headers.map(normHeader).join(' ');
  if (form.category && form.category !== 'Animal Research' && /(mouse|murine|mus_musculus)/.test(headerBlob)) {
    errors.push('Column names indicate an animal assay. Select Animal Research. This file was not imported into a human or synthetic class.');
  }

  const summary = summarize(table.headers, table.rows);
  if (summary && summary.missingRate > 0.5) {
    warnings.push('More than half of the cells are missing. Missing cells were not replaced with zero.');
  }
  if (summary && summary.duplicateRows > 0) {
    warnings.push(`${summary.duplicateRows} exact duplicate rows were kept. Cleaning can hide them in a separate view without deleting the original table.`);
  }
  if (!form.category) errors.push('Choose a data class before import.');
  if (!form.name?.trim()) errors.push('Enter a dataset name.');
  if (!form.source?.trim()) errors.push('Enter a data source so the file keeps its provenance.');
  if (!form.confirmed) errors.push('Confirm that this file is a single data class.');

  return { errors, warnings, summary, detectedClass: classes[0] || null };
}

export function summarize(headers, rows) {
  if (!headers?.length || !rows?.length) {
    return {
      records: rows?.length || 0,
      missingCells: 0,
      cells: 0,
      missingRate: rows?.length ? 0 : null,
      missingByColumn: {},
      duplicateRows: 0,
      quality: { score: null, label: 'Unavailable' },
      numericColumns: [],
      preservedColumns: [],
    };
  }
  const missingByColumn = Object.fromEntries(headers.map((header) => [header, 0]));
  let cells = 0;
  for (const row of rows) {
    for (const header of headers) {
      cells += 1;
      if (isMissing(row[header])) missingByColumn[header] += 1;
    }
  }
  const missingCells = Object.values(missingByColumn).reduce((sum, count) => sum + count, 0);
  const duplicateRows = countDuplicates(rows, headers);
  const missingRate = cells ? missingCells / cells : null;
  const duplicateRate = rows.length ? duplicateRows / rows.length : 0;
  const numericColumns = headers.filter((header) => isNumericColumn(rows, header));
  const preservedColumns = numericColumns.filter((header) => SKIP_NORMALIZATION.test(normHeader(header)));
  return {
    records: rows.length,
    missingCells,
    cells,
    missingRate,
    missingByColumn,
    duplicateRows,
    quality: qualityFromRates(missingRate, duplicateRate),
    numericColumns,
    preservedColumns,
  };
}

function countDuplicates(rows, headers) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const key = JSON.stringify(headers.map((header) => (isMissing(row[header]) ? null : row[header])));
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function isNumericColumn(rows, header) {
  const present = rows.map((row) => row[header]).filter((value) => !isMissing(value));
  if (!present.length) return false;
  const numeric = present.filter((value) => parseNumeric(value) != null);
  return numeric.length / present.length >= 0.7;
}

function qualityFromRates(missingRate, duplicateRate) {
  if (missingRate == null) return { score: null, label: 'Unavailable' };
  const score = Math.max(0, Math.round((1 - missingRate) * (1 - duplicateRate) * 100));
  const label = score >= 90 ? 'High' : score >= 75 ? 'Moderate' : 'Low';
  return { score, label };
}

function columnStats(rows, header) {
  const numbers = [];
  let missing = 0;
  for (const row of rows) {
    const value = parseNumeric(row[header]);
    if (value == null) missing += 1;
    else numbers.push(value);
  }
  if (!numbers.length) return { count: 0, missing, min: null, max: null, mean: null, median: null, sd: null };
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numbers.length;
  const sorted = [...numbers].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: numbers.length,
    missing,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    mean,
    median,
    sd: Math.sqrt(variance),
  };
}

function mlOutcome(category) {
  if (category === 'Animal Research') {
    return {
      outcome: 'blocked',
      detail: 'Animal records stay in their own class. They are not features for a human vital-sign model. No model was trained.',
    };
  }
  if (category === 'NASA Spaceflight') {
    return {
      outcome: 'held',
      detail: 'Spaceflight research stays separate from ground-based and synthetic tables. No model was trained in this browser.',
    };
  }
  if (category === 'Ground-Based Human') {
    return {
      outcome: 'prepared',
      detail: 'Features were extracted inside this ground-based table only. Nothing was merged with spaceflight, animal, or synthetic rows. Training waits for the FastAPI service.',
    };
  }
  if (category === 'Synthetic Demo') {
    return {
      outcome: 'prepared',
      detail: 'Features describe SYNTHETIC_DEMO rows only. They are not flight evidence, and no model was fit.',
    };
  }
  return {
    outcome: 'held',
    detail: 'The data class is missing, so this table is not marked ready. No model was trained.',
  };
}

export function runPipeline(dataset) {
  const rows = dataset.rows || [];
  const headers = dataset.headers?.length ? dataset.headers : (rows[0] ? Object.keys(rows[0]) : []);
  const summary = summarize(headers, rows);
  const timestampHeader = findHeader(headers, ['timestamp', 'datetime', 'recorded_at']);
  const sampleHeader = findHeader(headers, ['sample_id', 'sampleid', 'specimen_id']);
  const steps = [
    {
      id: 'collect',
      title: 'Data Collection',
      state: rows.length ? 'complete' : 'error',
      detail: rows.length
        ? `${rows.length} records from ${dataset.name}. Class: ${dataset.category}. The original rows stay in session memory.`
        : 'No records are available. Nothing was collected.',
    },
  ];

  if (!rows.length) {
    const skipped = ['validate', 'missing', 'clean', 'normalize', 'features', 'ml'];
    const titles = {
      validate: 'Data Validation',
      missing: 'Missing Values Detection',
      clean: 'Data Cleaning',
      normalize: 'Data Normalization',
      features: 'Feature Extraction',
      ml: 'Ready for Machine Learning',
    };
    skipped.forEach((id) => steps.push({ id, title: titles[id], state: 'skipped', detail: 'Skipped because no records were collected.' }));
    return { steps, profile: summary, ranAt: new Date().toISOString() };
  }

  steps.push({
    id: 'validate',
    title: 'Data Validation',
    state: dataset.category ? 'complete' : 'error',
    detail: [
      dataset.category ? `Declared class: ${dataset.category}.` : 'No data class was declared.',
      timestampHeader ? `Timestamp column "${timestampHeader}" was kept.` : 'No timestamp column was found, so none was invented.',
      sampleHeader ? `Sample id column "${sampleHeader}" was kept.` : 'No sample id column was found, so none was invented.',
      dataset.confirmedStatement || 'Original metadata was retained with the session dataset.',
    ].join(' '),
  });

  const missingColumns = Object.entries(summary.missingByColumn)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  steps.push({
    id: 'missing',
    title: 'Missing Values Detection',
    state: 'complete',
    detail: missingColumns.length
      ? `${summary.missingCells} missing cells. They stay empty and are not coded as zero.`
      : 'No missing values were found in this table.',
    missingColumns,
  });

  steps.push({
    id: 'clean',
    title: 'Data Cleaning',
    state: 'complete',
    detail: `Original table retained at ${summary.records} rows. A cleaned view would set aside ${summary.duplicateRows} exact duplicate rows. Rows were not deleted from the original table, and gaps were not imputed.`,
  });

  const features = summary.numericColumns.map((header) => ({ header, ...columnStats(rows, header) }));
  const skippedNormalization = features.filter((feature) => SKIP_NORMALIZATION.test(normHeader(feature.header)) || feature.sd === 0);
  const normalized = features.filter((feature) => !skippedNormalization.includes(feature) && feature.sd);
  steps.push({
    id: 'normalize',
    title: 'Data Normalization',
    state: 'complete',
    detail: normalized.length
      ? `Z-scores can be computed beside ${normalized.length} numeric columns. Original cells were not overwritten. ${skippedNormalization.length} columns were left untouched because they already look normalized or have no variance.`
      : 'No column was re-normalized. Original values stay as imported.',
    skippedColumns: skippedNormalization.map((feature) => feature.header),
  });

  steps.push({
    id: 'features',
    title: 'Feature Extraction',
    state: 'complete',
    detail: features.length
      ? `Summaries were computed for ${features.length} numeric columns inside this table only.`
      : 'No numeric columns were detected, so no features were extracted.',
    features,
  });

  const ready = mlOutcome(dataset.category);
  steps.push({
    id: 'ml',
    title: 'Ready for Machine Learning',
    state: 'complete',
    outcome: ready.outcome,
    detail: ready.detail,
  });

  return { steps, profile: summary, ranAt: new Date().toISOString() };
}

const VITAL_ALIASES = {
  heartRate: ['heart_rate', 'heartrate', 'hr', 'bpm'],
  spo2: ['spo2', 'oxygen_saturation', 'o2_sat', 'spo2_percent'],
  systolic: ['systolic', 'sbp', 'systolic_bp', 'systolic_mmhg', 'blood_pressure_systolic'],
  diastolic: ['diastolic', 'dbp', 'diastolic_bp', 'diastolic_mmhg', 'blood_pressure_diastolic'],
  temperature: ['temperature', 'temp', 'body_temperature', 'temperature_c', 'temp_c', 'temperature_f', 'temp_f', 'body_temperature_f'],
  respiratoryRate: ['respiratory_rate', 'resp_rate', 'rr', 'respiration'],
  sleep: ['sleep', 'sleep_duration', 'sleep_hours', 'sleep_h'],
  activity: ['activity', 'activity_level', 'activity_index'],
  radiation: ['radiation', 'dose_rate', 'radiation_exposure', 'radiation_ugy_h', 'absorbed_dose_rate'],
  muscle: ['muscle', 'muscle_health', 'muscle_index', 'muscle_health_index'],
};

function parseIsoLike(value) {
  if (isMissing(value)) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2})?/.test(text)) return null;
  const time = Date.parse(text);
  if (Number.isNaN(time)) return null;
  const iso = new Date(time).toISOString();
  return { time, iso, label: `${iso.slice(5, 10)} ${iso.slice(11, 16)}` };
}

export function extractMetricSeries(rows, dataset) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const timeKey = findHeader(keys, ['timestamp', 'datetime', 'recorded_at']);
  const idKey = findHeader(keys, ['sample_id', 'sampleid', 'specimen_id']);
  const provenanceKey = findHeader(keys, ['provenance', 'data_provenance']);
  const classKey = findHeader(keys, ['data_class', 'dataclass']);
  const stamps = rows.map((row) => (timeKey ? parseIsoLike(row[timeKey]) : null));
  const timeFiltering = stamps.some(Boolean);
  const omitted = timeFiltering ? stamps.filter((stamp) => !stamp).length : 0;

  function buildPoints(read) {
    const points = [];
    rows.forEach((row, index) => {
      const stamp = stamps[index];
      if (timeFiltering && !stamp) return;
      const reading = read(row);
      points.push({
        t: stamp?.iso || null,
        label: stamp?.label || (timeKey && !isMissing(row[timeKey]) ? String(row[timeKey]) : `Row ${index + 1}`),
        sampleId: idKey && !isMissing(row[idKey]) ? String(row[idKey]) : null,
        provenance: provenanceKey && !isMissing(row[provenanceKey]) ? String(row[provenanceKey]) : 'IMPORTED',
        source: dataset.source || dataset.filename || 'Session import',
        dataClass: (classKey && canonicalClass(row[classKey])) || dataset.category,
        hasTimestamp: Boolean(stamp),
        ...reading,
      });
    });
    return points;
  }

  const series = {};
  const single = ['heartRate', 'spo2', 'temperature', 'respiratoryRate', 'sleep', 'activity', 'radiation', 'muscle'];
  single.forEach((metricKey) => {
    const column = findHeader(keys, VITAL_ALIASES[metricKey]);
    if (!column) return;
    series[metricKey] = buildPoints((row) => ({
      value: parseNumeric(row[column]),
      ...(metricKey === 'temperature' ? { unit: temperatureUnitFromHeader(column) } : {}),
    }));
  });

  const systolicColumn = findHeader(keys, VITAL_ALIASES.systolic);
  const diastolicColumn = findHeader(keys, VITAL_ALIASES.diastolic);
  if (systolicColumn || diastolicColumn) {
    series.bloodPressure = buildPoints((row) => {
      const systolic = systolicColumn ? parseNumeric(row[systolicColumn]) : null;
      const diastolic = diastolicColumn ? parseNumeric(row[diastolicColumn]) : null;
      return { value: systolic, systolic, diastolic };
    });
  }

  const referenceMs = Math.max(...stamps.filter(Boolean).map((stamp) => stamp.time), 0) || null;
  return { series, timeFiltering, referenceMs, omitted };
}

function temperatureUnitFromHeader(header) {
  const normalized = normHeader(header);
  if (/(^|_)(f|fahrenheit)$/.test(normalized)) return '°F';
  if (/(^|_)(c|celsius)$/.test(normalized)) return '°C';
  return null;
}

export function downloadSampleCsv() {
  const csv = [
    'sample_id,timestamp,heart_rate,spo2,provenance,data_class',
    'SYN-SAMPLE-001,2026-11-14T12:00:00Z,72,98,SYNTHETIC_DEMO,Synthetic Demo',
    'SYN-SAMPLE-002,2026-11-14T13:00:00Z,,97,SYNTHETIC_DEMO,Synthetic Demo',
  ].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'synthetic_demo_vitals_sample.csv');
}

export async function downloadSampleXlsx() {
  const XLSX = await import('@e965/xlsx');
  const rows = [
    { sample_id: 'SYN-SAMPLE-001', timestamp: '2026-11-14T12:00:00Z', heart_rate: 72, spo2: 98, provenance: 'SYNTHETIC_DEMO', data_class: 'Synthetic Demo' },
    { sample_id: 'SYN-SAMPLE-002', timestamp: '2026-11-14T13:00:00Z', heart_rate: null, spo2: 97, provenance: 'SYNTHETIC_DEMO', data_class: 'Synthetic Demo' },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'vitals');
  const contents = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  downloadBlob(
    new Blob([contents], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'synthetic_demo_vitals_sample.xlsx',
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
