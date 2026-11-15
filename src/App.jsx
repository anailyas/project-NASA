import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell,
  BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  Cpu, Database, Download, Dumbbell, ExternalLink, FileCheck2, FileSpreadsheet,
  Filter, Heart, HeartHandshake, HeartPulse, LayoutDashboard, Menu, Moon,
  Orbit, Radio, Search, Send, Settings as SettingsIcon, ShieldAlert,
  Shirt, Sparkles, Thermometer, Upload, UserRound, UsersRound, Wind, X, Zap,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DATASETS } from './data/datasets.js';
import { ASTRONAUT_ROSTER } from './data/astronautRoster.js';
import { getDemoBundle } from './data/demoData.js';
import { METRICS, METRIC_MAP } from './data/metrics.js';
import { astronaut, mission, PROFILE_FACTS } from './data/mission.js';
import {
  createDefaultSettings, mergeSettings, THRESHOLD_FIELDS, validateThresholds,
} from './data/thresholds.js';
import { requestAssistant } from './services/aiService.js';
import { checkHealth } from './services/api.js';
import PsychologicalSupport from './pages/PsychologicalSupport.jsx';
import SmartShirtManagement from './pages/SmartShirtManagement.jsx';
import AstronautsPage from './pages/AstronautsPage.jsx';
import { createDefaultSmartShirtConfig } from './services/smartShirtService.js';
import { createSyntheticAstronautTelemetry, TELEMETRY_REFRESH_MS } from './services/astronautTelemetryService.js';
import SmartShirtLogo from './components/SmartShirtLogo.jsx';
import {
  checkFile, downloadSampleCsv, downloadSampleXlsx, extractMetricSeries,
  parseSpreadsheetFile, reviewImport, runPipeline,
} from './services/datasetService.js';
import { buildMeasurementAlerts, buildNoticeAlerts, filterByRange, RANGES, windowMean } from './utils/series.js';
import { formatNumber, formatStamp } from './utils/format.js';
import { STATUS_META, statusForPoint } from './utils/status.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Monitoring' },
  { id: 'astronauts', label: 'Astronauts', icon: UsersRound, group: 'Monitoring' },
  { id: 'analytics', label: 'Health analytics', icon: Activity, group: 'Monitoring' },
  { id: 'mission', label: 'Mission control', icon: Orbit, group: 'Monitoring' },
  { id: 'smart-shirt', label: 'Smart Shirt Management', icon: Shirt, group: 'Monitoring' },
  { id: 'psychological-support', label: 'AI Psychological Support', icon: HeartHandshake, group: 'Crew support' },
  { id: 'assistant', label: 'AI analysis', icon: BrainCircuit, group: 'Data & intelligence' },
  { id: 'alerts', label: 'Alerts & events', icon: Bell, group: 'System' },
  { id: 'profile', label: 'Crew profile', icon: UserRound, group: 'System' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, group: 'System' },
];

const METRIC_ICONS = {
  heartRate: HeartPulse,
  spo2: Heart,
  bloodPressure: Activity,
  temperature: Thermometer,
  respiratoryRate: Wind,
  sleep: Moon,
  activity: Zap,
  radiation: Radio,
  muscle: Dumbbell,
};

const STORAGE_KEYS = {
  settings: 'aether-settings-v1',
  acknowledged: 'aether-acknowledged-alerts-v1',
};

function readStoredJson(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function sourceName(source) {
  return source?.name || 'No dataset selected';
}

function displayValue(metricKey, point, temperatureUnit) {
  if (!point) return null;
  if (metricKey === 'bloodPressure') {
    if (point.systolic == null || point.diastolic == null) return null;
    return `${formatNumber(point.systolic)} / ${formatNumber(point.diastolic)}`;
  }
  if (metricKey === 'temperature') {
    return formatNumber(convertTemperature(point.value, point, temperatureUnit), 1);
  }
  return formatNumber(point.value, METRIC_MAP[metricKey]?.digits ?? 0);
}

function temperatureSourceUnit(point) {
  return point?.unit || (point?.provenance === 'SYNTHETIC_DEMO' ? '°C' : null);
}

function convertTemperature(value, point, targetUnit) {
  const sourceUnit = temperatureSourceUnit(point);
  if (value == null || !sourceUnit) return value;
  if (sourceUnit === '°C' && targetUnit === 'F') return (Number(value) * 9) / 5 + 32;
  if (sourceUnit === '°F' && targetUnit === 'C') return ((Number(value) - 32) * 5) / 9;
  return Number(value);
}

function metricUnit(metricKey, temperatureUnit, point) {
  if (metricKey !== 'temperature') return METRIC_MAP[metricKey]?.unit;
  if (point && !temperatureSourceUnit(point)) return 'source units unstated';
  return `°${temperatureUnit}`;
}

function mostRecent(points, now) {
  const available = [...(points || [])].filter((point) => point.value != null || point.systolic != null);
  const timestamped = available
    .filter((point) => point.t && Date.parse(point.t) <= now)
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t))[0];
  return timestamped || available.filter((point) => !point.t).at(-1) || null;
}

function IconButton({ label, onClick, children, className = '' }) {
  return <button aria-label={label} className={`icon-button ${className}`} onClick={onClick} type="button">{children}</button>;
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unavailable;
  return <span className={`status-pill status-${status}`}>{meta.label}</span>;
}

function SectionTitle({ eyebrow, title, description, action }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

function MetricCard({ metric, point, status, temperatureUnit, referenceMs, series }) {
  const Icon = METRIC_ICONS[metric.key] || Activity;
  const current = point ? displayValue(metric.key, point, temperatureUnit) : null;
  const values = (series || []).filter((item) => item.value != null || item.systolic != null);
  const last = values.at(-1);
  const before = values.at(-2);
  let trendText = 'No trend data';
  let TrendIcon = ArrowRight;
  let trendClass = '';
  if (last && before) {
    const lastValue = metric.key === 'bloodPressure'
      ? last.systolic
      : metric.key === 'temperature' ? convertTemperature(last.value, last, temperatureUnit) : last.value;
    const prevValue = metric.key === 'bloodPressure'
      ? before.systolic
      : metric.key === 'temperature' ? convertTemperature(before.value, before, temperatureUnit) : before.value;
    const difference = Number(lastValue) - Number(prevValue);
    TrendIcon = difference > 0 ? ArrowUpRight : difference < 0 ? ArrowDownRight : ArrowRight;
    trendClass = difference > 0 ? 'trend-up' : difference < 0 ? 'trend-down' : '';
    trendText = `${difference > 0 ? '+' : ''}${formatNumber(difference, metric.digits)} vs prior`;
  }
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className={`metric-icon metric-icon-${metric.key}`}><Icon size={17} /></span>
        <StatusPill status={status} />
      </div>
      <div className="metric-name">{metric.label}</div>
      <div className="metric-reading">
        <strong>{current ?? <span className="no-data">No Data Available</span>}</strong>
        {current && <span>{metricUnit(metric.key, temperatureUnit, point)}</span>}
      </div>
      <div className="metric-foot">
        <span className={trendClass}><TrendIcon size={14} />{trendText}</span>
        <span title={point?.t ? formatStamp(point.t) : ''}>{point?.t ? formatStamp(point.t).replace(' UTC', '') : 'No timestamp'}</span>
      </div>
      <div className="metric-source">{point?.source || 'No source selected'}</div>
    </article>
  );
}

function MiniStat({ icon: Icon, label, value, note, accent = '' }) {
  return (
    <div className={`mini-stat ${accent}`}>
      <span className="mini-stat-icon"><Icon size={16} /></span>
      <div><span className="mini-stat-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
    </div>
  );
}

function OverviewPage({ data, settings, selectedSource, onNavigate, alerts, acknowledged, now, moodCheckins, shirtConfig, liveReading, liveAstronaut }) {
  const latest = Object.fromEntries(METRICS.map((metric) => [
    metric.key, mostRecent(data.series[metric.key], now),
  ]));
  const liveTemperature = liveReading
    ? settings.temperatureUnit === 'F'
      ? (liveReading.temperatureC * 9) / 5 + 32
      : liveReading.temperatureC
    : null;
  const liveMetrics = [
    { label: 'Heart rate', value: liveReading?.heartRate, unit: 'BPM' },
    { label: 'SpO2', value: liveReading?.spo2, unit: '%' },
    { label: 'Blood pressure', value: liveReading ? `${liveReading.systolic}/${liveReading.diastolic}` : null, unit: 'mmHg' },
    { label: 'Body temperature', value: liveTemperature == null ? null : formatNumber(liveTemperature, 1), unit: `°${settings.temperatureUnit}` },
    { label: 'Radiation dose rate', value: liveReading?.radiationRate, unit: 'uSv/h' },
    { label: 'Activity intensity', value: liveReading?.activityIntensity, unit: '0-100' },
  ];
  const openAlerts = alerts.filter((alert) =>
    (alert.severity === 'critical' || alert.severity === 'warning') && !acknowledged.has(alert.id));
  const severe = openAlerts.filter((alert) => alert.severity === 'critical').length;
  const latestCheckin = moodCheckins.at(-1);
  const moodSequence = moodCheckins.slice(-3).map((checkin) => checkin.mood).join(' → ') || 'No check-ins yet';
  const configuredSensors = Object.values(shirtConfig.sensors).filter((sensor) => sensor.configured).length;
  return (
    <>
      <SectionTitle
        eyebrow="FLIGHT HEALTH / LIVE CONSOLE"
        title="Crew health overview"
        description="A clear view of available measurements, trends, and mission signals."
        action={<button className="button button-secondary" onClick={() => onNavigate('analytics')}><Activity size={15} /> View analytics <ArrowRight size={14} /></button>}
      />
      <div className="notice-banner">
        <span className="notice-pulse" />
        <div><strong>{!selectedSource ? 'No data source selected' : `${selectedSource.category} source`}</strong><span> {!selectedSource ? 'Enable the synthetic stream in Settings to display demo measurements.' : selectedSource.category === 'Synthetic Demo' ? 'Generated values are labeled SYNTHETIC_DEMO and are not astronaut measurements.' : 'Showing measurements from the selected source.'}</span></div>
        <button className="text-button" onClick={() => onNavigate('astronauts')}>View crew <ChevronRight size={15} /></button>
      </div>
      <section className="dashboard-live-strip" aria-label="Synthetic shirt telemetry preview">
        <div className="dashboard-live-heading">
          <div><span className="eyebrow">FIVE-SECOND SYNTHETIC PREVIEW</span><strong>{liveAstronaut?.name || 'Crew profile'} · {liveAstronaut?.id || ''}</strong></div>
          <span>{settings.demoStream && liveReading ? `Updated ${new Date(liveReading.timestamp).toLocaleTimeString()}` : 'Demo stream paused'}</span>
        </div>
        <div className="dashboard-live-values">
          {liveMetrics.map((item) => <div key={item.label}><span>{item.label}</span><strong>{settings.demoStream && item.value != null ? item.value : '—'}</strong><small>{settings.demoStream && item.value != null ? item.unit : 'Unavailable'}</small></div>)}
        </div>
        <p>Generated from a fictional crew profile; not received from a connected shirt or validated for medical use.</p>
      </section>
      <div className="metric-grid">
        {METRICS.map((metric) => {
          const point = latest[metric.key];
          return <MetricCard key={metric.key} metric={metric} point={point} series={data.series[metric.key]} status={statusForPoint(metric.key, point, settings.thresholds)} temperatureUnit={settings.temperatureUnit} />;
        })}
      </div>
      <div className="dashboard-lower">
        <section className="panel mission-summary">
          <div className="panel-heading"><div><span className="eyebrow">MISSION SNAPSHOT</span><h2>{mission.name}</h2></div><span className="live-tag"><span /> SCENARIO ACTIVE</span></div>
          <div className="mission-facts">
            <div><span>Mission phase</span><strong>{mission.phase}</strong></div>
            <div><span>Scenario clock</span><strong>{mission.duration}</strong></div>
          </div>
          <div className="mission-progress"><div><span>MISSION TIMELINE</span><span>46 / 180 days</span></div><div className="progress-track"><span style={{ width: '26%' }} /></div></div>
          <div className="mission-summary-bottom"><span><Orbit size={15} /> Fictional demonstration mission</span><button className="text-button" onClick={() => onNavigate('mission')}>Mission control <ChevronRight size={15} /></button></div>
        </section>
        <section className="panel alert-summary">
          <div className="panel-heading"><div><span className="eyebrow">ATTENTION REQUIRED</span><h2>Recent threshold events</h2></div><button className="text-button" onClick={() => onNavigate('alerts')}>All alerts <ChevronRight size={15} /></button></div>
          {!openAlerts.length ? <EmptyState title="No open alerts" text="No warning or critical events are waiting in this source." /> : (
            <div className="compact-alert-list">
              {openAlerts.slice(0, 4).map((alert) => <AlertRow key={alert.id} alert={alert} compact />)}
            </div>
          )}
          <div className="alert-counts"><span className="count-critical"><i /> {severe} critical</span><span className="count-warning"><i /> {openAlerts.length - severe} warning</span></div>
        </section>
      </div>
      <div className="dashboard-modules">
        <section className="panel dashboard-module-card dashboard-mood-card">
          <div className="dashboard-module-icon"><HeartHandshake size={18} /></div>
          <div className="dashboard-module-content">
            <span className="eyebrow">CREW WELL-BEING · VOLUNTARY ONLY</span>
            <h2>Psychological well-being</h2>
            <div className="dashboard-module-facts">
              <div><span>Latest check-in</span><strong>{latestCheckin?.mood || 'No check-in'}</strong></div>
              <div><span>Reported mood trend</span><strong>{moodSequence}</strong></div>
              <div><span>Last check-in</span><strong>{latestCheckin ? formatStamp(latestCheckin.createdAt) : 'Not recorded'}</strong></div>
            </div>
            <p>Voluntary mood labels only. No conversation content or psychological assessment is shown here.</p>
          </div>
          <button className="button button-secondary" onClick={() => onNavigate('psychological-support')} type="button">Open support <ArrowRight size={14} /></button>
        </section>
        <section className="panel dashboard-module-card dashboard-shirt-card">
          <div className="dashboard-module-icon"><SmartShirtLogo size={22} /></div>
          <div className="dashboard-module-content">
            <span className="eyebrow">WEARABLE DEVICE · DEMO PROFILE</span>
            <h2>Smart Shirt status</h2>
            <div className="dashboard-module-facts">
              <div><span>Device status</span><strong>{shirtConfig.deviceName ? 'Profile configured' : 'Not Configured'}</strong></div>
              <div><span>Connection</span><strong>Not connected</strong></div>
              <div><span>Configured sensors</span><strong>{configuredSensors} configured</strong></div>
              <div><span>Last synchronization</span><strong>Not Configured</strong></div>
            </div>
            <p>Hardware specifications are unknown. No real shirt is connected.</p>
          </div>
          <button className="button button-secondary" onClick={() => onNavigate('smart-shirt')} type="button">Manage shirt <ArrowRight size={14} /></button>
        </section>
      </div>
      <div className="dashboard-bottom">
        <MiniStat icon={Database} label="ACTIVE DATA SOURCE" value={sourceName(selectedSource)} note={selectedSource?.category || 'No data class'} />
        <MiniStat icon={ShieldAlert} label="MONITORING STATUS" value={openAlerts.length ? 'Review events' : 'Within configured bands'} note={`${openAlerts.length} open threshold events`} accent={openAlerts.length ? 'stat-warning' : 'stat-good'} />
        <MiniStat icon={Clock3} label="LAST DATA POINT" value={latest.heartRate?.t ? formatStamp(latest.heartRate.t) : 'No Data Available'} note={latest.heartRate?.sampleId || 'No sample id'} />
      </div>
    </>
  );
}

function EmptyState({ title, text, action }) {
  return <div className="empty-state"><span className="empty-icon"><Database size={20} /></span><strong>{title}</strong><p>{text}</p>{action}</div>;
}

function AlertRow({ alert, compact = false, acknowledged, onAcknowledge }) {
  const Icon = alert.severity === 'critical' ? ShieldAlert : alert.severity === 'warning' ? AlertTriangle : CheckCircle2;
  return (
    <div className={`alert-row alert-${alert.severity} ${acknowledged ? 'is-acknowledged' : ''}`}>
      <span className="alert-row-icon"><Icon size={17} /></span>
      <div className="alert-row-copy"><div><strong>{alert.title}</strong><StatusPill status={alert.severity} /></div><p>{alert.detail}</p><small>{formatStamp(alert.timestamp)} · {alert.source}{alert.sampleId ? ` · ${alert.sampleId}` : ''}</small></div>
      {!compact && alert.kind !== 'notice' && <button className="button button-small button-quiet" onClick={() => onAcknowledge(alert.id)} disabled={acknowledged}>{acknowledged ? <><Check size={14} /> Acknowledged</> : 'Acknowledge'}</button>}
    </div>
  );
}

function AnalyticsPage({ data, settings, now, range, setRange, activeMetric, setActiveMetric, selectedSource }) {
  const points = useMemo(() => filterByRange(data.series[activeMetric] || [], range, now), [data.series, activeMetric, range, now]);
  const metric = METRIC_MAP[activeMetric];
  const chartData = points.map((point) => ({
    ...point,
    chartValue: activeMetric === 'bloodPressure'
      ? point.systolic
      : activeMetric === 'temperature'
        ? convertTemperature(point.value, point, settings.temperatureUnit)
        : point.value,
    chartLabel: point.label || formatStamp(point.t),
  })).filter((point) => Number.isFinite(point.chartValue));
  const chartUnit = metricUnit(activeMetric, settings.temperatureUnit, chartData[0]);
  const chartMetric = { ...metric, unit: chartUnit };
  const numericValues = chartData.map((point) => point.chartValue);
  const mean = numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : null;
  const previousMean = activeMetric === 'bloodPressure'
    ? windowMean(data.series[activeMetric], now, RANGES.find((item) => item.id === range)?.hours || 24, (RANGES.find((item) => item.id === range)?.hours || 24) * 2, (point) => point.systolic)
    : windowMean(data.series[activeMetric], now, RANGES.find((item) => item.id === range)?.hours || 24, (RANGES.find((item) => item.id === range)?.hours || 24) * 2, (point) => activeMetric === 'temperature' ? convertTemperature(point.value, point, settings.temperatureUnit) : point.value);
  return (
    <>
      <SectionTitle eyebrow="HEALTH DATA / TRENDS" title="Health analytics" description="Explore measured values across time. Empty windows stay empty; missing measurements are never filled with zero." />
      <section className="panel chart-panel">
        <div className="chart-toolbar">
          <div className="metric-select-wrap"><label htmlFor="metric-choice">MEASUREMENT</label><select id="metric-choice" value={activeMetric} onChange={(event) => setActiveMetric(event.target.value)}>{METRICS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></div>
          <div className="range-switch" role="group" aria-label="Chart time range">{RANGES.map((item) => <button key={item.id} className={range === item.id ? 'selected' : ''} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
        </div>
        <div className="chart-caption"><div><span>{metric.label}</span><strong>{mean == null ? 'No Data Available' : `${formatNumber(mean, metric.digits)} ${chartUnit}`}</strong></div><div className="chart-caption-meta"><span>{chartData.length} samples in range</span><span>Source: {sourceName(selectedSource)}</span></div></div>
        {chartData.length ? (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#203044" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="chartLabel" tick={{ fill: '#8092a7', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#8092a7', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip metric={chartMetric} />} />
                <Line type="monotone" dataKey="chartValue" stroke={metric.color} strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: metric.color, stroke: '#08111d', strokeWidth: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState title="No Data Available" text={`There are no ${metric.label.toLowerCase()} measurements for this source and time range.`} />}
        <div className="chart-legend"><span><i style={{ background: metric.color }} /> {metric.label}{activeMetric === 'bloodPressure' ? ' · systolic' : ''}</span><span>Data class: {selectedSource?.category || 'Unavailable'}</span></div>
        {activeMetric === 'bloodPressure' && chartData.some((point) => Number.isFinite(point.diastolic)) && <p className="chart-note">Blood-pressure chart displays systolic values. Diastolic values remain available in the data table and metric card.</p>}
      </section>
      <div className="analytics-stats">
        <MiniStat icon={Activity} label="SAMPLES IN WINDOW" value={chartData.length} note={`${RANGES.find((item) => item.id === range)?.label}`} />
        <MiniStat icon={ArrowRight} label="WINDOW MEAN" value={mean == null ? 'No Data Available' : `${formatNumber(mean, metric.digits)} ${chartUnit}`} note={previousMean == null ? 'Prior comparison window unavailable' : `Prior window mean ${formatNumber(previousMean, metric.digits)} ${chartUnit}`} />
        <MiniStat icon={Database} label="PROVENANCE" value={chartData.at(-1)?.provenance || 'UNAVAILABLE'} note={chartData.at(-1)?.sampleId || 'No sample in selected window'} />
      </div>
    </>
  );
}

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><strong>{label}</strong><span>{formatNumber(point.chartValue, metric.digits)} {metric.unit}</span><small>{point.sampleId || 'No sample id'} · {point.provenance || 'IMPORTED'}</small></div>;
}

function DatasetPage({ imported, onImport, selectedSourceId, setSelectedSourceId }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [form, setForm] = useState({ name: '', source: '', category: '', confirmed: false });
  const [table, setTable] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const allDatasets = useMemo(() => [
    ...DATASETS,
    ...imported.map((dataset) => ({
      id: dataset.datasetId, name: dataset.name, source: dataset.source,
      category: dataset.category, organism: dataset.organism || 'Not specified',
      description: dataset.description, fileFormat: dataset.fileFormat,
      url: dataset.url || null, recordCount: dataset.rows.length,
      updatedAt: dataset.importedAt,
      recordNote: `${dataset.rows.length} rows imported in this browser session.`,
      normalization: 'Original values and source units are preserved. No values were overwritten.',
      importStatus: 'Imported in this session',
    })),
  ], [imported]);
  const filtered = allDatasets.filter((dataset) => {
    const matchesCategory = category === 'All categories' || dataset.category === category;
    const text = `${dataset.id} ${dataset.name} ${dataset.source} ${dataset.description}`.toLowerCase();
    return matchesCategory && text.includes(query.toLowerCase());
  });
  const validation = table ? reviewImport(table, form) : null;

  async function handleFile(file) {
    setFileError('');
    setTable(null);
    if (!file) return;
    const issues = checkFile(file);
    if (issues.length) {
      setFileError(issues.join(' '));
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setTable(parsed);
      setFileName(file.name);
      setForm((current) => ({ ...current, name: current.name || file.name.replace(/\.[^.]+$/, '') }));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'The spreadsheet could not be read.');
    } finally {
      setBusy(false);
    }
  }

  function submitImport(event) {
    event.preventDefault();
    if (!table || !validation || validation.errors.length) return;
    const newDataset = {
      id: `import-${Date.now()}`,
      datasetId: `LOCAL-${Date.now()}`,
      name: form.name.trim(),
      source: form.source.trim(),
      category: form.category,
      organism: form.category === 'Animal Research' ? 'Declared animal-research dataset' : 'As declared by source',
      description: `Imported from ${fileName}. ${table.rows.length} source rows retained in browser session memory.`,
      fileFormat: fileName.split('.').pop().toUpperCase(),
      filename: fileName,
      headers: table.headers,
      rows: table.rows,
      confirmedStatement: 'User confirmed this file contains one data class.',
      importedAt: new Date().toISOString(),
    };
    onImport(newDataset);
    setSelectedSourceId(newDataset.id);
    setFileError('');
    setTable(null);
    setFileName('');
    setForm({ name: '', source: '', category: '', confirmed: false });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <>
      <SectionTitle eyebrow="DATA CATALOG / IMPORTS" title="Dataset management" description="Browse source records and validate files before they enter the active session." action={<button className="button button-secondary" onClick={() => fileInput.current?.click()}><Upload size={15} /> Upload dataset</button>} />
      <div className="dataset-summary-row">
        <MiniStat icon={Database} label="CATALOG RECORDS" value={allDatasets.length} note="External catalog entries and session imports" />
        <MiniStat icon={FileCheck2} label="IMPORTED THIS SESSION" value={imported.length} note="In-memory only; not uploaded to a server" accent="stat-good" />
        <MiniStat icon={Orbit} label="NASA SPACEFLIGHT RECORDS" value={DATASETS.filter((item) => item.category === 'NASA Spaceflight').length} note="Catalog entries; not claims of data import" />
      </div>
      <section className="panel import-panel">
        <div className="panel-heading"><div><span className="eyebrow">VALIDATED LOCAL IMPORT</span><h2>Import a data table</h2></div><span className="limit-label">CSV / XLSX / XLS · up to 12 MB</span></div>
        <div className="import-layout">
          <div className="drop-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }} role="button" aria-label="Choose or drop a spreadsheet file" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click(); }}>
            <span className="drop-icon"><Upload size={20} /></span><strong>{busy ? 'Reading spreadsheet…' : fileName || 'Choose a file or drop it here'}</strong><small>CSV, XLSX, and XLS files are validated in your browser.</small><span className="button button-secondary button-small">Browse files</span>
            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden onChange={(event) => handleFile(event.target.files[0])} />
          </div>
          <div className="import-guidance"><strong><FileSpreadsheet size={16} /> Before you import</strong><p>Choose the dataset class, source, and a single-class confirmation. Mixed-class files are blocked. Missing cells and original values are preserved.</p><div className="download-actions"><button className="text-button" onClick={downloadSampleCsv}><Download size={14} /> CSV example</button><button className="text-button" onClick={() => downloadSampleXlsx().catch((error) => setFileError(error.message))}><Download size={14} /> XLSX example</button></div></div>
        </div>
        {fileError && <div className="inline-error"><AlertTriangle size={15} />{fileError}</div>}
        {table && (
          <form className="import-review" onSubmit={submitImport}>
            <div className="review-top"><strong>Review import · {fileName}</strong><span>{table.rows.length} rows · {table.headers.length} columns · {table.sheetName}</span></div>
            <div className="form-grid import-form-grid">
              <label>Dataset name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Data source<input required placeholder="Organization or source URL" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
              <label>Data class<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">Select class</option>{['NASA Spaceflight', 'Ground-Based Human', 'Animal Research', 'Synthetic Demo'].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="checkbox-field"><input type="checkbox" checked={form.confirmed} onChange={(event) => setForm({ ...form, confirmed: event.target.checked })} /> I confirm this file contains one data class only.</label>
            </div>
            <div className="import-quality"><span>{table.rows.length} records</span><span>{table.headers.length} columns</span><span>{validation?.summary?.missingCells || 0} missing cells</span><span>{validation?.summary?.duplicateRows || 0} exact duplicate rows</span><span>Quality: {validation?.summary?.quality?.label || 'Unavailable'}</span></div>
            {validation?.errors?.length > 0 && <ul className="validation-errors">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
            {validation?.warnings?.length > 0 && <ul className="validation-warnings">{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <div className="preview-table-wrap"><table><thead><tr>{table.headers.slice(0, 6).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{table.rows.slice(0, 3).map((row, index) => <tr key={index}>{table.headers.slice(0, 6).map((header) => <td key={header}>{row[header] == null || row[header] === '' ? '—' : String(row[header])}</td>)}</tr>)}</tbody></table></div>
            <button className="button button-primary" type="submit" disabled={!validation || validation.errors.length > 0}><Check size={15} /> Import into this session</button>
          </form>
        )}
      </section>
      <section className="panel catalog-panel">
        <div className="catalog-toolbar">
          <div><span className="eyebrow">SOURCE DIRECTORY</span><h2>Dataset catalog</h2></div>
          <div className="catalog-controls">          <label className="search-field"><Search size={15} /><input aria-label="Search datasets" placeholder="Search datasets…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="select-field"><Filter size={14} /><select aria-label="Filter datasets by category" value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{['NASA Spaceflight', 'Ground-Based Human', 'Animal Research', 'Synthetic Demo'].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label></div>
        </div>
        <div className="dataset-list">
          {filtered.map((dataset) => {
            const importedItem = imported.find((item) => item.datasetId === dataset.id);
            const active = selectedSourceId === (importedItem?.id || dataset.id);
            return (
              <article className={`dataset-row ${active ? 'dataset-active' : ''}`} key={dataset.id}>
                <div className="dataset-row-icon"><Database size={18} /></div>
                <div className="dataset-main"><div className="dataset-title-line"><h3>{dataset.name}</h3><span className={`category-tag category-${dataset.category.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{dataset.category}</span></div><p>{dataset.description}</p><div className="dataset-meta"><span>{dataset.source}</span><span>{dataset.fileFormat}</span><span>{dataset.recordCount == null ? dataset.recordNote : `${dataset.recordCount} rows`}</span></div></div>
                <div className="dataset-actions"><span className={`import-status ${importedItem ? 'import-status-done' : ''}`}><i />{dataset.importStatus}</span><button className="text-button" onClick={() => setSelectedDetails(dataset)}>Details <ChevronRight size={14} /></button>{(dataset.category === 'Synthetic Demo' || importedItem) && <button className={`button button-small ${active ? 'button-selected' : 'button-secondary'}`} onClick={() => setSelectedSourceId(importedItem?.id || dataset.id)}>{active ? 'Active source' : 'Use source'}</button>}{dataset.url && <a className="external-link" href={dataset.url} target="_blank" rel="noreferrer" aria-label={`Open ${dataset.name} source`}><ExternalLink size={14} /></a>}</div>
              </article>
            );
          })}
          {!filtered.length && <EmptyState title="No matching datasets" text="Try another search term or category filter." />}
        </div>
      </section>
      {selectedDetails && <DatasetModal dataset={selectedDetails} onClose={() => setSelectedDetails(null)} />}
    </>
  );
}

function DatasetModal({ dataset, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dataset-modal-title">
        <div className="modal-header"><div><span className="eyebrow">DATASET DETAILS</span><h2 id="dataset-modal-title">{dataset.name}</h2></div><IconButton label="Close details" onClick={onClose}><X size={18} /></IconButton></div>
        <p>{dataset.description}</p><dl className="details-list"><div><dt>Dataset ID</dt><dd>{dataset.id}</dd></div><div><dt>Source</dt><dd>{dataset.source}</dd></div><div><dt>Category</dt><dd>{dataset.category}</dd></div><div><dt>Organism / subject</dt><dd>{dataset.organism}</dd></div><div><dt>File format</dt><dd>{dataset.fileFormat}</dd></div><div><dt>Records</dt><dd>{dataset.recordCount ?? dataset.recordNote ?? 'Not reported'}</dd></div><div><dt>Import status</dt><dd>{dataset.importStatus}</dd></div><div><dt>Last updated</dt><dd>{dataset.updatedAt ? formatStamp(dataset.updatedAt) : 'Not reported by source'}</dd></div><div><dt>Normalization / units</dt><dd>{dataset.normalization}</dd></div></dl>
        {dataset.url && <a className="button button-secondary" href={dataset.url} target="_blank" rel="noreferrer">Open source record <ExternalLink size={14} /></a>}
      </section>
    </div>
  );
}

function PipelinePage({ selectedSource, data }) {
  const result = selectedSource ? runPipeline(selectedSource) : null;
  const steps = result?.steps || [];
  const labels = { complete: 'Complete', error: 'Needs attention', skipped: 'Skipped' };
  return (
    <>
      <SectionTitle eyebrow="DATA QUALITY / PROCESSING" title="Processing pipeline" description="A transparent inspection summary. Source rows are retained; this browser does not train a model." />
      {!selectedSource ? <EmptyState title="No dataset selected" text="Choose or import a source dataset to inspect its processing status." /> : (
        <>
          <section className="panel pipeline-summary">
            <div className="pipeline-data-title"><span className="dataset-row-icon"><Database size={18} /></span><div><span className="eyebrow">SELECTED DATASET</span><h2>{selectedSource.name}</h2><p>{selectedSource.category} · {selectedSource.source}</p></div></div>
            <div className="pipeline-stats"><MiniStat icon={FileSpreadsheet} label="TOTAL RECORDS" value={result.profile.records} /><MiniStat icon={Filter} label="MISSING CELLS" value={result.profile.missingCells} note={result.profile.missingRate == null ? 'Unavailable' : `${(result.profile.missingRate * 100).toFixed(1)}% of cells`} /><MiniStat icon={Activity} label="EXACT DUPLICATES" value={result.profile.duplicateRows} /><MiniStat icon={CheckCircle2} label="DATA QUALITY" value={result.profile.quality.label} note={result.profile.quality.score == null ? 'Not calculated' : `Score ${result.profile.quality.score}/100`} /></div>
          </section>
          <section className="panel pipeline-panel"><div className="panel-heading"><div><span className="eyebrow">PROCESS TRACE</span><h2>Processing steps</h2></div><span className="last-run">Inspection generated {formatStamp(result.ranAt)}</span></div>
            <div className="pipeline-steps">{steps.map((step, index) => <article className={`pipeline-step step-${step.state}`} key={step.id}><div className="step-marker">{step.state === 'complete' ? <Check size={15} /> : step.state === 'error' ? <AlertTriangle size={15} /> : index + 1}</div><div className="step-copy"><div><h3>{step.title}</h3><span className={`step-state state-${step.state}`}>{labels[step.state]}</span></div><p>{step.detail}</p>{step.id === 'features' && step.features?.length > 0 && <div className="feature-chips">{step.features.slice(0, 8).map((feature) => <span key={feature.header}>{feature.header}: μ {formatNumber(feature.mean, 2)}</span>)}</div>}</div></article>)}</div>
            {result.profile.preservedColumns?.length > 0 && <div className="pipeline-footnote"><strong>Normalization safeguard:</strong> columns that appear log-transformed, normalized, or z-scored were left untouched: {result.profile.preservedColumns.join(', ')}.</div>}
          </section>
        </>
      )}
    </>
  );
}

function AssistantPage({ context, settings }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'I can summarize the selected source and its threshold events. This demo assistant is not a medical decision-maker; verify timestamps, units, and provenance before using any summary.', kind: 'demo' }]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const hasMeasurements = context.latest?.some((item) => item.text);
  const thresholdRisk = !hasMeasurements
    ? 'Unavailable'
    : context.openAlerts?.some((alert) => alert.severity === 'critical')
      ? 'High'
      : context.openAlerts?.some((alert) => alert.severity === 'warning')
        ? 'Moderate'
        : 'Low';
  async function submit(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setMessages((items) => [...items, { role: 'user', content: text }]);
    setMessage('');
    setBusy(true);
    try {
      const response = await requestAssistant({ message: text, context, settings });
      setMessages((items) => [...items, { role: 'assistant', ...response }]);
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', kind: 'error', content: error instanceof Error ? error.message : 'The assistant request failed.', disclaimer: null }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle eyebrow="DECISION SUPPORT / DEMO" title="AI health analysis" description="Source-aware summaries for demonstration. Outputs are informational, not diagnoses or crew-clearance decisions." />
      <div className="assistant-layout">
        <section className="panel assistant-chat">
          <div className="assistant-chat-head"><div className="assistant-avatar"><Sparkles size={17} /></div><div><h2>AETHER assistant</h2><span><i /> {settings.ai.endpoint ? 'Configured backend' : 'DEMO MODE · no model connected'}</span></div><span className="demo-badge">NOT MEDICAL ADVICE</span></div>
          <div className="message-list">{messages.map((item, index) => <div className={`chat-message message-${item.role} ${item.kind === 'error' ? 'message-error' : ''}`} key={`${index}-${item.role}`}><span className="message-avatar">{item.role === 'assistant' ? <Sparkles size={14} /> : <UserRound size={14} />}</span><div><p>{item.content}</p>{item.disclaimer && <small>{item.disclaimer}</small>}{item.kind && <span className={`message-kind kind-${item.kind}`}>{item.kind === 'backend' ? 'BACKEND RESPONSE' : item.kind === 'error' ? 'ENDPOINT ERROR' : 'DEMO RESPONSE'}</span>}</div></div>)}{busy && <div className="typing-state"><span /><span /><span /> Preparing source-aware response…</div>}</div>
          <form className="chat-form" onSubmit={submit}><input aria-label="Ask the assistant" placeholder="Ask about the selected data…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy || !message.trim()}><Send size={15} /> Send</button></form>
        </section>
        <aside className="assistant-side">
          <section className="panel risk-classification"><span className="eyebrow">RULE-BASED DEMO REVIEW</span><h2>Threshold event level</h2><strong className={`risk-level risk-${thresholdRisk.toLowerCase()}`}>{thresholdRisk}</strong><p>Derived from configured demo thresholds only. This is not a medical risk score or model prediction.</p><div className="risk-review-row"><span>Threshold events</span><b>{context.openAlerts?.length || 0}</b></div><div className="risk-review-row"><span>Model confidence</span><b>Unavailable · no model connected</b></div><div className="risk-review-row"><span>Suggested next step</span><b>Verify source records with a qualified reviewer</b></div></section>
          <section className="panel risk-panel"><span className="eyebrow">SOURCE SNAPSHOT</span><h2>Selected readings</h2>{context.latest?.length ? context.latest.map((item) => <div className="risk-reading" key={item.key}><span>{item.label}</span><strong>{item.text ? `${item.text} ${item.unit}` : 'No Data Available'}</strong><StatusPill status={item.status} /></div>) : <p className="muted-copy">No numeric measurements are available in this source.</p>}<div className="source-proof"><span>PROVENANCE</span><strong>{context.provenance || 'UNAVAILABLE'}</strong><small>{context.sourceLabel}</small></div></section>
          <section className="panel guardrail-panel"><ShieldAlert size={18} /><h3>Safety boundary</h3><p>This responder does not diagnose, prescribe, or clear a crew member. A flight surgeon must review primary records. Never treat a synthetic result as a flight finding.</p></section>
          <section className="panel quick-prompts"><span className="eyebrow">TRY ASKING</span>{['Summarize the current readings', 'Are there any open alerts?', 'What is the radiation data source?'].map((prompt) => <button key={prompt} onClick={() => setMessage(prompt)}>{prompt}<ArrowRight size={14} /></button>)}</section>
        </aside>
      </div>
    </>
  );
}

function AlertsPage({ alerts, acknowledged, onAcknowledge }) {
  const [filter, setFilter] = useState('All');
  const visible = alerts.filter((alert) => filter === 'All'
    || (filter === 'Open'
      ? (alert.severity === 'critical' || alert.severity === 'warning') && !acknowledged.has(alert.id)
      : alert.severity === filter.toLowerCase()));
  return (
    <>
      <SectionTitle eyebrow="EVENT LOG / THRESHOLD MONITOR" title="Alerts & notifications" description="Threshold events are generated from the selected source and current configurable demo bands." action={<label className="select-field alert-filter"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>Open</option><option>Critical</option><option>Warning</option><option>Normal</option></select><ChevronDown size={14} /></label>} />
      <div className="alert-summary-cards"><MiniStat icon={ShieldAlert} label="CRITICAL" value={alerts.filter((item) => item.severity === 'critical').length} accent="stat-critical" /><MiniStat icon={AlertTriangle} label="WARNING" value={alerts.filter((item) => item.severity === 'warning').length} accent="stat-warning" /><MiniStat icon={Bell} label="ACKNOWLEDGED" value={acknowledged.size} note="Saved in this browser" /></div>
      <section className="panel alerts-panel"><div className="panel-heading"><div><span className="eyebrow">EVENT HISTORY</span><h2>{visible.length} notifications</h2></div><span className="last-run">Active source only</span></div>{visible.length ? <div className="full-alert-list">{visible.map((alert) => <AlertRow key={alert.id} alert={alert} acknowledged={acknowledged.has(alert.id)} onAcknowledge={onAcknowledge} />)}</div> : <EmptyState title="No alerts in this filter" text="Try another filter or choose a source with available measurements." />}</section>
    </>
  );
}

function ProfilePage({ data, settings, now }) {
  const available = METRICS.filter((metric) => mostRecent(data.series[metric.key], now));
  return (
    <>
      <SectionTitle eyebrow="CREW / DEMONSTRATION PROFILE" title="Crew profile" description="Fictional profile for interface demonstration only. No real astronaut data is represented." />
      <div className="profile-layout"><section className="panel profile-card"><div className="profile-avatar"><UserRound size={28} /></div><div className="profile-main"><span className="eyebrow">FICTIONAL DEMO PROFILE</span><h2>{astronaut.name}</h2><p>{astronaut.role}</p><span className="profile-id">{astronaut.id}</span></div><StatusPill status="normal" /><div className="profile-facts">{PROFILE_FACTS.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
        <div className="profile-side"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">AVAILABLE INDICATORS</span><h2>Selected-source coverage</h2></div></div><div className="indicator-list">{METRICS.map((metric) => { const hasData = Boolean(mostRecent(data.series[metric.key], now)); return <div key={metric.key}><span>{metric.label}</span><StatusPill status={hasData ? 'normal' : 'unavailable'} /></div>; })}</div></section><section className="panel medical-note"><ShieldAlert size={18} /><div><h3>Medical history</h3><p>Not provided. This demonstration profile contains no clinical history or confirmed medical findings.</p></div></section></div></div>
    </>
  );
}

function MissionPage({ alerts, data, now }) {
  const recent = alerts.filter((alert) => alert.kind === 'measurement').slice(0, 3);
  return (
    <>
      <SectionTitle eyebrow="MISSION OPERATIONS / SCENARIO" title="Mission control" description="Fictional AETHER-7 timeline and monitoring indicators. Mission details are scenario data, not a real flight." />
      <div className="mission-hero panel"><div className="mission-orbit"><Orbit size={28} /></div><div><span className="eyebrow">ACTIVE SCENARIO</span><h2>{mission.name}</h2><p>{mission.title}</p></div><span className="live-tag"><span /> {mission.status.toUpperCase()}</span></div>
      <div className="mission-control-grid"><section className="panel timeline-panel"><div className="panel-heading"><div><span className="eyebrow">FLIGHT PLAN</span><h2>Mission timeline</h2></div></div><div className="timeline">{mission.phases.map((phase) => <article key={phase.id} className={`timeline-item phase-${phase.state}`}><span className="timeline-node">{phase.state === 'complete' ? <Check size={13} /> : phase.state === 'current' ? <span /> : null}</span><div><div><h3>{phase.name}</h3><span className={`phase-state phase-state-${phase.state}`}>{phase.state}</span></div><p>{phase.window}</p></div></article>)}</div></section>
        <div className="mission-right"><section className="panel mission-duration"><span className="eyebrow">SCENARIO CLOCK</span><strong>Day 46 <small>/ 180</small></strong><p>{mission.phase}</p><div className="progress-track"><span style={{ width: '26%' }} /></div><small>Scenario timestamp · {formatStamp(mission.clock)}</small></section>
          <section className="panel monitor-status"><span className="eyebrow">MONITORING SIGNALS</span><div><HeartPulse size={16} /><span>Health measurements</span><StatusPill status={Object.values(data.series).some((points) => points.length) ? 'normal' : 'unavailable'} /></div><div><Radio size={16} /><span>Radiation telemetry</span><StatusPill status="unavailable" /></div><p>NASA RadLab has not been queried. Any radiation values shown in the demo stream are synthetic.</p></section></div>
      </div>
      <section className="panel recent-events"><div className="panel-heading"><div><span className="eyebrow">RECENT HEALTH EVENTS</span><h2>Selected-source threshold events</h2></div></div>{recent.length ? recent.map((alert) => <AlertRow key={alert.id} alert={alert} compact />) : <EmptyState title="No measurement events" text="No warning or critical measurement events are available from the active source." />}</section>
    </>
  );
}

function SettingsPage({ settings, updateSettings, saveMessage }) {
  const thresholdErrors = validateThresholds(settings.thresholds);
  const [backendStatus, setBackendStatus] = useState({ state: 'idle', message: 'Not checked' });
  const [checkingBackend, setCheckingBackend] = useState(false);
  function updateThreshold(key, bound, value) {
    const parsed = value === '' ? null : Number(value);
    updateSettings({ thresholds: { ...settings.thresholds, [key]: { ...settings.thresholds[key], [bound]: parsed } } });
  }
  async function testBackend() {
    setCheckingBackend(true);
    setBackendStatus({ state: 'checking', message: 'Checking /health…' });
    try {
      const result = await checkHealth(settings.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '');
      setBackendStatus({ state: 'connected', message: `Connected · ${JSON.stringify(result)}` });
    } catch (error) {
      const detail = error?.response?.data?.detail || (error instanceof Error ? error.message : 'The health endpoint did not respond.');
      setBackendStatus({ state: 'error', message: detail });
    } finally {
      setCheckingBackend(false);
    }
  }
  return (
    <>
      <SectionTitle eyebrow="PREFERENCES / CONNECTIVITY" title="System settings" description="Preferences and threshold bands are saved locally in this browser. API keys do not belong in frontend settings." action={saveMessage && <span className="saved-label"><CheckCircle2 size={14} /> {saveMessage}</span>} />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">DISPLAY</span><h2>Appearance & units</h2></div></div>
          <div className="setting-row"><div><strong>Temperature unit</strong><small>Demo data is stored in Celsius; imported source units remain preserved.</small></div><select aria-label="Temperature unit" value={settings.temperatureUnit} onChange={(event) => updateSettings({ temperatureUnit: event.target.value })}><option value="C">Celsius (°C)</option><option value="F">Fahrenheit (°F)</option></select></div>
          <div className="setting-row"><div><strong>Density</strong><small>Spacing of dashboard cards.</small></div><select aria-label="Density" value={settings.density} onChange={(event) => updateSettings({ density: event.target.value })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
          <div className="setting-row"><div><strong>Reduce motion</strong><small>Limit decorative interface animations.</small></div><Toggle checked={settings.reduceMotion} onChange={(checked) => updateSettings({ reduceMotion: checked })} label="Reduce motion" /></div>
        </section>
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">NOTIFICATIONS</span><h2>Notification preferences</h2></div></div>
          {['critical', 'warning', 'normal'].map((level) => <div className="setting-row" key={level}><div><strong>{level[0].toUpperCase() + level.slice(1)} notifications</strong><small>Show {level} events in the alert history.</small></div><Toggle checked={settings.notifications[level]} onChange={(checked) => updateSettings({ notifications: { [level]: checked } })} label={`${level} notifications`} /></div>)}
        </section>
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">DATA SOURCE</span><h2>Monitoring stream</h2></div></div>
          <div className="setting-row"><div><strong>Synthetic demo stream</strong><small>Generated values are explicitly labeled SYNTHETIC_DEMO.</small></div><Toggle checked={settings.demoStream} onChange={(checked) => updateSettings({ demoStream: checked })} label="Synthetic demo stream" /></div>
          <label className="setting-input">API base URL <small>Leave blank to use the configured local proxy.</small><input type="url" placeholder="http://127.0.0.1:8000" value={settings.apiBaseUrl} onChange={(event) => updateSettings({ apiBaseUrl: event.target.value })} /></label>
        </section>
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">AI SERVICE</span><h2>Assistant configuration</h2></div><span className={`mode-label ${settings.ai.endpoint ? 'mode-connected' : ''}`}>{settings.ai.endpoint ? 'Endpoint configured' : 'Demo mode'}</span></div>
          <p className="settings-warning"><ShieldAlert size={15} />Do not enter API keys here. Configure authentication on a trusted backend; browser settings are not secret storage.</p>
          <label className="setting-input">AI service endpoint<input type="url" placeholder="https://your-backend.example" value={settings.ai.endpoint} onChange={(event) => updateSettings({ ai: { endpoint: event.target.value } })} /></label>
          <label className="setting-input">Model label <small>Optional backend model name. The frontend does not load a model.</small><input placeholder="Backend model (optional)" value={settings.ai.model} onChange={(event) => updateSettings({ ai: { model: event.target.value } })} /></label>
        </section>
        <section className="panel settings-panel threshold-settings"><div className="panel-heading"><div><span className="eyebrow">DEMONSTRATION BANDS</span><h2>Threshold configuration</h2></div></div><p className="muted-copy">These configurable bands are demo settings, not clinical guidance. Validation errors are shown before applying an inconsistent set.</p>
          <div className="threshold-grid">{THRESHOLD_FIELDS.map((field) => <div className="threshold-row" key={field.key}><div><strong>{field.label}</strong><small>{field.unit}</small></div>{field.bounds.map((bound) => <label key={bound}><span>{bound.replace(/([A-Z])/g, ' $1')}</span><input aria-label={`${field.label} ${bound}`} type="number" step="any" value={settings.thresholds[field.key][bound] ?? ''} onChange={(event) => updateThreshold(field.key, bound, event.target.value)} /></label>)}</div>)}</div>
          {Object.entries(thresholdErrors).map(([key, error]) => <div className="threshold-error" key={key}>{METRIC_MAP[key]?.label || key}: {error}</div>)}
        </section>
        <section className="panel system-info"><div className="system-info-head"><span className="eyebrow">SYSTEM INFORMATION</span><button className="button button-secondary button-small" onClick={testBackend} disabled={checkingBackend}>{checkingBackend ? 'Checking…' : 'Test backend health'}</button></div><div><span>Platform</span><strong>AETHER Health Monitor</strong></div><div><span>Version</span><strong>1.0.0 · Demo build</strong></div><div><span>Mission data</span><strong>{mission.id} · fictional scenario</strong></div><div><span>Backend status</span><strong className={`backend-${backendStatus.state}`}>{backendStatus.message}</strong></div></section>
      </div>
    </>
  );
}

function Toggle({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}

export default function App() {
  const [settings, setSettings] = useState(() => mergeSettings(createDefaultSettings(), readStoredJson(STORAGE_KEYS.settings, {})));
  const [acknowledged, setAcknowledged] = useState(() => new Set(readStoredJson(STORAGE_KEYS.acknowledged, [])));
  const [imported, setImported] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(() => createDefaultSettings().demoStream ? 'SYNTHETIC-HOURLY' : '');
  const [page, setPage] = useState('overview');
  const [range, setRange] = useState('24h');
  const [activeMetric, setActiveMetric] = useState('heartRate');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [moodCheckins, setMoodCheckins] = useState([]);
  const [shirtConfig, setShirtConfig] = useState(() => createDefaultSmartShirtConfig());
  const [shirtPreviewAstronautId, setShirtPreviewAstronautId] = useState('AST-001');
  const [telemetrySequence, setTelemetrySequence] = useState(0);
  const demo = useMemo(() => getDemoBundle(), []);
  const liveTelemetry = useMemo(
    () => Object.fromEntries(ASTRONAUT_ROSTER.map((profile) => [
      profile.id,
      createSyntheticAstronautTelemetry(profile, telemetrySequence),
    ])),
    [telemetrySequence],
  );
  const selectedImported = imported.find((dataset) => dataset.id === selectedSourceId);
  const selectedCatalog = DATASETS.find((dataset) => dataset.id === selectedSourceId);
  const selectedSource = selectedImported || (
    selectedCatalog?.category === 'Synthetic Demo' && !settings.demoStream
      ? null
      : selectedCatalog || null
  );
  const importedData = useMemo(
    () => selectedImported ? extractMetricSeries(selectedImported.rows, selectedImported) : null,
    [selectedImported],
  );
  const now = importedData?.referenceMs || demo.now;
  const data = useMemo(() => {
    if (selectedImported && importedData) return { series: importedData.series, hourlyRows: selectedImported.rows, dailyRows: [], hourlyDataset: selectedImported, dailyDataset: null, now: importedData.referenceMs };
    if (!settings.demoStream) return { series: Object.fromEntries(METRICS.map((metric) => [metric.key, []])), hourlyRows: [], dailyRows: [], hourlyDataset: null, dailyDataset: null, now: Date.now() };
    if (selectedCatalog?.id === 'SYNTHETIC-HOURLY' || selectedCatalog?.id === 'SYNTHETIC-DAILY') return demo;
    return demo;
  }, [selectedImported, importedData, selectedCatalog, demo, settings.demoStream]);
  const allMeasurementAlerts = useMemo(() => buildMeasurementAlerts(data.series, settings.thresholds, selectedImported?.id || 'syn'), [data.series, settings.thresholds, selectedImported]);
  const notices = useMemo(() => buildNoticeAlerts(settings.demoStream), [settings.demoStream]);
  const alerts = useMemo(() => [...allMeasurementAlerts, ...notices].filter((alert) => settings.notifications[alert.severity] !== false).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)), [allMeasurementAlerts, notices, settings.notifications]);
  const unreadAlerts = alerts.filter((alert) => (alert.severity === 'critical' || alert.severity === 'warning') && !acknowledged.has(alert.id)).length;
  const selectedMetricPoints = METRICS.map((metric) => {
    const point = mostRecent(data.series[metric.key], now);
    const shown = displayValue(metric.key, point, settings.temperatureUnit);
    return { key: metric.key, label: metric.label, text: shown, unit: metricUnit(metric.key, settings.temperatureUnit, point), status: statusForPoint(metric.key, point, settings.thresholds) };
  });
  const assistantContext = {
    sourceLabel: sourceName(selectedSource),
    dataClass: selectedSource?.category || null,
    provenance: selectedImported
      ? 'IMPORTED'
      : selectedSource?.category === 'Synthetic Demo' && settings.demoStream ? 'SYNTHETIC_DEMO' : 'UNAVAILABLE',
    latest: selectedMetricPoints,
    openAlerts: alerts.filter((alert) => !acknowledged.has(alert.id) && alert.kind === 'measurement'),
    trends: METRICS.map((metric) => {
      const points = data.series[metric.key] || [];
      const picker = (point) => metric.key === 'bloodPressure'
        ? point.systolic
        : metric.key === 'temperature' ? convertTemperature(point.value, point, settings.temperatureUnit) : point.value;
      const currentMean = windowMean(points, now, 0, 24, picker);
      const previousMean = windowMean(points, now, 24, 48, picker);
      const hasTemperatureUnit = metric.key !== 'temperature' || temperatureSourceUnit(points[0]);
      const delta = !hasTemperatureUnit || currentMean == null || previousMean == null ? null : currentMean - previousMean;
      return {
        label: metric.label,
        unit: metricUnit(metric.key, settings.temperatureUnit, points[0]),
        delta: Number.isFinite(delta) ? delta : null,
      };
    }),
  };

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    setSaveMessage('Saved locally');
    const timer = window.setTimeout(() => setSaveMessage(''), 1800);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.acknowledged, JSON.stringify([...acknowledged]));
  }, [acknowledged]);

  useEffect(() => {
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.density, settings.reduceMotion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTelemetrySequence((sequence) => sequence + 1);
    }, TELEMETRY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  function updateSettings(patch) {
    setSettings((current) => mergeSettings(current, patch));
  }

  function acknowledgeAlert(id) {
    setAcknowledged((current) => new Set([...current, id]));
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMobileNavOpen(false);
  }

  const pageTitles = {
    overview: 'Flight health console',
    astronauts: 'Astronauts',
    analytics: 'Health analytics',
    mission: 'Mission control',
    'smart-shirt': 'Smart Shirt Management',
    'psychological-support': 'AI Psychological Support',
    assistant: 'AI health analysis',
    alerts: 'Alerts & notifications',
    profile: 'Crew profile',
    settings: 'System settings',
  };

  let content;
  if (page === 'overview') content = <OverviewPage data={data} settings={settings} selectedSource={selectedSource} onNavigate={navigate} alerts={alerts} acknowledged={acknowledged} now={now} moodCheckins={moodCheckins} shirtConfig={shirtConfig} liveReading={liveTelemetry[shirtPreviewAstronautId]} liveAstronaut={ASTRONAUT_ROSTER.find((profile) => profile.id === shirtPreviewAstronautId)} />;
  else if (page === 'astronauts') content = <AstronautsPage crew={ASTRONAUT_ROSTER} readings={liveTelemetry} demoEnabled={settings.demoStream} onPreviewShirt={(astronautId) => { setShirtPreviewAstronautId(astronautId); navigate('smart-shirt'); }} />;
  else if (page === 'analytics') content = <AnalyticsPage data={data} settings={settings} now={now} range={range} setRange={setRange} activeMetric={activeMetric} setActiveMetric={setActiveMetric} selectedSource={selectedSource} />;
  else if (page === 'assistant') content = <AssistantPage context={assistantContext} settings={settings} />;
  else if (page === 'alerts') content = <AlertsPage alerts={alerts} acknowledged={acknowledged} onAcknowledge={acknowledgeAlert} />;
  else if (page === 'profile') content = <ProfilePage data={data} settings={settings} now={now} />;
  else if (page === 'mission') content = <MissionPage alerts={alerts} data={data} now={now} />;
  else if (page === 'smart-shirt' || page === 'psychological-support') content = null;
  else content = <SettingsPage settings={settings} updateSettings={updateSettings} saveMessage={saveMessage} />;

  return (
    <div className="app-shell">
      {mobileNavOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate('overview'); }}><span className="brand-mark"><Orbit size={20} /></span><span><strong>AETHER</strong><small>FLIGHT HEALTH SYSTEMS</small></span></a>
        <div className="mission-chip"><span className="mission-chip-dot" /><div><small>MISSION SCENARIO</small><strong>{mission.id} · LEO</strong></div><ChevronDown size={14} /></div>
        {['Monitoring', 'Crew support', 'Data & intelligence', 'System'].map((group) => <nav className="nav-group" key={group} aria-label={group}><span className="nav-group-label">{group}</span>{NAV_ITEMS.filter((item) => item.group === group).map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'nav-active' : ''}`} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span>{item.id === 'alerts' && unreadAlerts > 0 && <b className="nav-count">{unreadAlerts > 9 ? '9+' : unreadAlerts}</b>}</button>; })}</nav>)}
        <div className="sidebar-bottom"><div className="sidebar-status"><span className="status-light" /><span><strong>DEMO ENVIRONMENT</strong><small>Local browser session</small></span></div><div className="sidebar-user"><span className="user-avatar">AQ</span><span><strong>{astronaut.name}</strong><small>Fictional demo profile</small></span><ChevronDown size={15} /></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></IconButton><div className="breadcrumb"><span>AETHER</span><ChevronRight size={14} /><strong>{pageTitles[page]}</strong></div></div><div className="topbar-right"><span className="utc-clock"><Clock3 size={14} /> {formatStamp(new Date().toISOString())}</span><span className="topbar-divider" /><span className="source-state"><i /> {selectedSource?.category || 'NO SOURCE'}</span><button className="topbar-alert" aria-label={`${unreadAlerts} unacknowledged alerts`} onClick={() => navigate('alerts')}><Bell size={17} />{unreadAlerts > 0 && <b>{unreadAlerts > 9 ? '9+' : unreadAlerts}</b>}</button></div></header>
        <div className="content-area">
          {content}
          <div hidden={page !== 'psychological-support'}><PsychologicalSupport active={page === 'psychological-support'} checkins={moodCheckins} onSaveCheckin={(checkin) => setMoodCheckins((current) => [...current, checkin])} /></div>
          <div hidden={page !== 'smart-shirt'}><SmartShirtManagement config={shirtConfig} setConfig={setShirtConfig} demoBundle={demo} demoEnabled={settings.demoStream} crew={ASTRONAUT_ROSTER} readings={liveTelemetry} selectedAstronautId={shirtPreviewAstronautId} onSelectAstronaut={setShirtPreviewAstronautId} /></div>
          <footer className="app-footer"><span>AETHER · NASA Space Apps demonstration interface</span><span>Fictional scenario · Verify provenance before use</span></footer>
        </div>
      </main>
    </div>
  );
}
