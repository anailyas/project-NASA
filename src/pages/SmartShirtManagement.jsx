import { useState } from 'react';
import {
  Activity, Battery, Bluetooth, Clock3, Cpu, History, Radio,
  RefreshCw, Settings2, Signal, Wifi, Wrench,
} from 'lucide-react';
import SmartShirtLogo from '../components/SmartShirtLogo.jsx';
import {
  SMART_SHIRT_DEMO_EVENTS, SMART_SHIRT_HISTORY_FILTERS, SMART_SHIRT_SENSOR_CATALOG,
} from '../data/smartShirtDemoData.js';
import { getReconnectPlaceholder } from '../services/smartShirtService.js';

function configuredValue(value) {
  return value?.trim() || 'Not Configured';
}

function timestampLabel(value) {
  return value ? new Date(value).toLocaleString() : 'Not Configured';
}

function DeviceFact({ label, value }) {
  return <div className="shirt-device-fact"><span>{label}</span><strong>{value || 'Not Configured'}</strong></div>;
}

function buildTelemetryCards(reading, enabled, temperatureUnit) {
  const temperature = reading?.temperatureC == null
    ? null
    : temperatureUnit === 'F'
      ? (reading.temperatureC * 9) / 5 + 32
      : reading.temperatureC;
  const fields = [
    { id: 'heart-rate', metric: 'heartRate', name: 'Heart rate', value: reading?.heartRate, unit: 'BPM', digits: 0 },
    { id: 'spo2', metric: 'spo2', name: 'SpO2', value: reading?.spo2, unit: '%', digits: 1 },
    { id: 'radiation-rate', metric: 'radiation', name: 'Radiation dose rate', value: reading?.radiationRate, unit: 'uSv/h', digits: 3 },
    { id: 'cumulative-dose', metric: 'dose', name: 'Cumulative dose', value: reading?.cumulativeDose, unit: 'uSv', digits: 3 },
    { id: 'blood-pressure', metric: 'bloodPressure', name: 'Blood pressure', value: reading ? `${reading.systolic}/${reading.diastolic}` : null, unit: 'mmHg' },
    { id: 'temperature', metric: 'temperature', name: 'Body temperature', value: temperature, unit: temperatureUnit === 'F' ? '°F' : '°C', digits: 1 },
    { id: 'respiratory-rate', metric: 'respiratoryRate', name: 'Breathing rate', value: reading?.breathingRate, unit: 'breaths/min', digits: 0 },
    { id: 'activity', metric: 'activity', name: 'Activity intensity', value: reading?.activityIntensity, unit: '0-100', digits: 0 },
    { id: 'muscle-performance', metric: 'muscle', name: 'Muscle performance', value: reading?.musclePerformanceScore, unit: '0-100', digits: 0 },
    { id: 'sleep-duration', metric: 'sleep', name: 'Sleep duration', value: reading?.sleepDurationHours, unit: 'hours', digits: 1 },
    { id: 'sleep-quality', metric: 'sleep-quality', name: 'Sleep quality', value: reading?.sleepQualityScore, unit: '0-100', digits: 0 },
  ];

  return fields.map((field) => ({
    ...field,
    value: enabled ? field.value ?? null : null,
    timestamp: enabled ? reading?.timestamp || null : null,
    provenance: enabled ? 'SYNTHETIC_DEMO' : null,
  }));
}

function SensorCard({ sensor, value, onChange }) {
  const unit = value.unit || '';
  return (
    <article className={`shirt-sensor-card ${value.configured ? 'shirt-sensor-configured' : ''}`}>
      <div className="shirt-sensor-top">
        <span className="shirt-sensor-icon"><Activity size={16} /></span>
        <span className={`shirt-config-status ${value.configured ? 'shirt-configured' : ''}`}>{value.configured ? 'Configured · not connected' : 'Not Configured'}</span>
      </div>
      <h3>{sensor.name}</h3>
      <span className="shirt-sensor-type">{sensor.type}</span>
      <div className="shirt-sensor-details">
        <div><span>Availability</span><strong>{value.configured ? 'Configured; unverified' : 'Not Configured'}</strong></div>
        <div><span>Connection</span><strong>Not connected</strong></div>
        <div><span>Last measurement</span><strong>Not received</strong></div>
        <div><span>Signal quality</span><strong>Not Configured</strong></div>
        <div><span>Sensor health</span><strong>{value.configured ? 'Awaiting device data' : 'Not Configured'}</strong></div>
      </div>
      <label className="shirt-unit-field">Measurement unit<input disabled={!value.configured} onChange={(event) => onChange(sensor.id, 'unit', event.target.value)} placeholder="Not Configured" value={unit} /></label>
      <label className="shirt-config-toggle"><input checked={value.configured} onChange={(event) => onChange(sensor.id, 'configured', event.target.checked)} type="checkbox" /><span>Configure sensor</span></label>
    </article>
  );
}

function TelemetryCard({ item }) {
  const available = item.value != null;
  const value = !available
    ? 'No synthetic sample'
    : typeof item.value !== 'number'
      ? item.value
      : item.metric === 'activity'
      ? item.value.toFixed(0)
      : item.value.toLocaleString(undefined, { maximumFractionDigits: item.digits });
  return (
    <article className="shirt-telemetry-card">
      <div><span className="eyebrow">{item.name}</span><span className="shirt-demo-dot">SYNTHETIC_DEMO</span></div>
      <strong className={available ? '' : 'shirt-no-telemetry'}>{value}</strong>
      <span className="shirt-telemetry-unit">{available ? item.unit : 'Demo stream unavailable'}</span>
      <small>{available ? timestampLabel(item.timestamp) : 'Not a real shirt reading'}</small>
    </article>
  );
}

function DeviceSettings({ config, onUpdate, onRemoveAssignment, crew }) {
  return (
    <section className="panel shirt-settings-panel">
      <div className="panel-heading"><div><span className="eyebrow">LOCAL DEMO CONFIGURATION</span><h2>Device settings</h2></div><Settings2 size={17} /></div>
      <p className="shirt-panel-intro">These editable values describe a future device profile only. They are held in browser memory and do not configure physical hardware.</p>
      <div className="shirt-settings-grid">
        <label>Device name<input onChange={(event) => onUpdate('deviceName', event.target.value)} placeholder="Not Configured" value={config.deviceName} /></label>
        <label>Device ID<input onChange={(event) => onUpdate('deviceId', event.target.value)} placeholder="Not Configured" value={config.deviceId} /></label>
        <label>Device model<input onChange={(event) => onUpdate('model', event.target.value)} placeholder="Not Configured" value={config.model} /></label>
        <label>Manufacturer<input onChange={(event) => onUpdate('manufacturer', event.target.value)} placeholder="Not Configured" value={config.manufacturer} /></label>
        <label>Firmware version<input onChange={(event) => onUpdate('firmwareVersion', event.target.value)} placeholder="Not Configured" value={config.firmwareVersion} /></label>
        <label>Assigned astronaut<select onChange={(event) => onUpdate('assignedAstronaut', event.target.value)} value={config.assignedAstronaut}><option value="">Not Configured</option>{crew.map((astronaut) => <option key={astronaut.id} value={astronaut.id}>{astronaut.name} · {astronaut.id}</option>)}</select></label>
        <label>Temperature display unit<select onChange={(event) => onUpdate('temperatureUnit', event.target.value)} value={config.temperatureUnit}><option value="C">Celsius (°C)</option><option value="F">Fahrenheit (°F)</option></select></label>
        <label>Synchronization preference<select onChange={(event) => onUpdate('syncPreference', event.target.value)} value={config.syncPreference}><option>Manual</option><option>Every 5 minutes</option><option>Every 15 minutes</option><option>Hourly</option></select></label>
      </div>
      <div className="shirt-settings-actions">
        <span>Preference only · synchronization is not active.</span>
        <button className="button button-quiet button-small" disabled={!config.assignedAstronaut} onClick={onRemoveAssignment} type="button">Remove assignment</button>
      </div>
    </section>
  );
}

export default function SmartShirtManagement({
  config,
  setConfig,
  demoEnabled,
  crew,
  readings,
  selectedAstronautId,
  onSelectAstronaut,
}) {
  const [connectionMessage, setConnectionMessage] = useState('');
  const [historyFilter, setHistoryFilter] = useState('All events');
  const selectedAstronaut = crew.find((astronaut) => astronaut.id === selectedAstronautId);
  const reading = readings[selectedAstronautId];
  const telemetry = buildTelemetryCards(reading, demoEnabled, config.temperatureUnit);
  const configuredSensors = SMART_SHIRT_SENSOR_CATALOG.filter((sensor) => config.sensors[sensor.id]?.configured);
  const events = SMART_SHIRT_DEMO_EVENTS.filter((event) => historyFilter === 'All events' || event.category === historyFilter);
  const assignedAstronaut = crew.find((astronaut) => astronaut.id === config.assignedAstronaut);

  function updateDevice(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updateSensor(sensorId, key, value) {
    setConfig((current) => ({
      ...current,
      sensors: {
        ...current.sensors,
        [sensorId]: {
          ...current.sensors[sensorId],
          [key]: value,
          ...(key === 'configured' && !value ? { unit: '' } : {}),
        },
      },
    }));
  }

  function removeAssignment() {
    updateDevice('assignedAstronaut', '');
  }

  return (
    <>
      <div className="section-title shirt-section-title">
        <div><span className="eyebrow">WEARABLE SYSTEMS · DEVICE CONSOLE</span><h1>Smart Shirt Management</h1><p>Configure a future shirt profile and review synthetic telemetry without implying a hardware connection.</p></div>
        <span className="shirt-not-connected"><i /> NOT CONNECTED</span>
      </div>

      <div className="shirt-demo-banner" role="status">
        <span className="shirt-demo-mark"><SmartShirtLogo size={27} /></span>
        <div><strong>DEMO MODE – NOT CONNECTED TO REAL SHIRT</strong><span>Device specifications are unconfirmed. The five-second preview is generated from fictional crew profiles; no hardware connection has been attempted.</span></div>
      </div>

      <div className="shirt-model-layout">
        <section className="panel shirt-model-panel">
          <div className="panel-heading"><div><span className="eyebrow">REFERENCE MODEL</span><h2>Smart shirt model</h2></div><span className="shirt-config-status">Visual reference</span></div>
          <div className="shirt-model-stage">
            <img className="shirt-model-image" src="/astronaut-smart-shirt-model.svg" alt="White biometric shirt with gray panels, chest sensors, sleeve sensor, and a blood-pressure cuff" />
          </div>
          <p className="shirt-model-caption">3D-style perspective of the shirt reference you supplied. The drawing is illustrative; sensor positions and specifications still need hardware confirmation.</p>
        </section>
        <section className="panel shirt-model-info">
          <div className="panel-heading"><div><span className="eyebrow">PROFILE INFORMATION</span><h2>Device details</h2></div><SmartShirtLogo size={22} /></div>
          <div className="shirt-model-info-list">
            <DeviceFact label="Device name" value={configuredValue(config.deviceName)} />
            <DeviceFact label="Device model" value={configuredValue(config.model)} />
            <DeviceFact label="Manufacturer" value={configuredValue(config.manufacturer)} />
            <DeviceFact label="Assigned astronaut" value={assignedAstronaut ? `${assignedAstronaut.name} (${assignedAstronaut.id})` : 'Not Configured'} />
            <DeviceFact label="Connection" value="Not connected" />
            <DeviceFact label="Preview profile" value={selectedAstronaut ? `${selectedAstronaut.name} (${selectedAstronaut.id})` : 'Not Configured'} />
            <DeviceFact label="Preview source" value={demoEnabled ? 'Synthetic demo only' : 'Paused'} />
            <DeviceFact label="Refresh interval" value="5 seconds · demo only" />
          </div>
        </section>
      </div>

      <section className="panel shirt-overview-panel">
        <div className="panel-heading"><div><span className="eyebrow">DEVICE OVERVIEW</span><h2>{configuredValue(config.deviceName)}</h2></div><span className="shirt-config-status">Profile · not connected</span></div>
        <div className="shirt-device-facts">
          <DeviceFact label="Device ID" value={configuredValue(config.deviceId)} />
          <DeviceFact label="Model" value={configuredValue(config.model)} />
          <DeviceFact label="Manufacturer" value={configuredValue(config.manufacturer)} />
          <DeviceFact label="Assigned astronaut" value={assignedAstronaut ? `${assignedAstronaut.name} (${assignedAstronaut.id})` : 'Not Configured'} />
          <DeviceFact label="Device status" value="Not connected" />
          <DeviceFact label="Connection status" value="Not connected" />
          <DeviceFact label="Last synchronization" value="Not Configured" />
          <DeviceFact label="Firmware version" value={configuredValue(config.firmwareVersion)} />
        </div>
      </section>

      <div className="shirt-connectivity-grid">
        <section className="panel shirt-connectivity-panel">
          <div className="panel-heading"><div><span className="eyebrow">COMMUNICATION INTERFACES</span><h2>Connectivity</h2></div><Radio size={17} /></div>
          <div className="shirt-connectivity-list">
            <div><Bluetooth size={16} /><span>Bluetooth</span><strong>Not Configured</strong></div>
            <div><Wifi size={16} /><span>Wi-Fi</span><strong>Not Configured</strong></div>
            <div><Signal size={16} /><span>Connection status</span><strong>Not connected</strong></div>
            <div><Clock3 size={16} /><span>Last connection</span><strong>Not Configured</strong></div>
            <div><RefreshCw size={16} /><span>Synchronization</span><strong>Not Configured</strong></div>
            <div><Radio size={16} /><span>Connection errors</span><strong>Not Configured</strong></div>
          </div>
          <div className="shirt-reconnect-row">
            <button className="button button-secondary" onClick={() => setConnectionMessage(getReconnectPlaceholder())} type="button"><RefreshCw size={14} /> Retry connection</button>
            <span>No supported transport or protocol selected.</span>
          </div>
          {connectionMessage && <p className="shirt-connection-message" role="status">{connectionMessage}</p>}
        </section>
        <section className="panel shirt-health-panel">
          <div className="panel-heading"><div><span className="eyebrow">POWER & DEVICE HEALTH</span><h2>Hardware status</h2></div><Battery size={17} /></div>
          <div className="shirt-health-grid">
            <DeviceFact label="Battery level" value="Not Configured" />
            <DeviceFact label="Battery status" value="Not Configured" />
            <DeviceFact label="Device temperature" value="Not Configured" />
            <DeviceFact label="Signal quality" value="Not Configured" />
            <DeviceFact label="Storage status" value="Not Configured" />
            <DeviceFact label="Configured sensors" value={`${configuredSensors.length} of ${SMART_SHIRT_SENSOR_CATALOG.length}`} />
          </div>
        </section>
      </div>

      <section className="panel shirt-live-panel">
        <div className="shirt-live-toolbar">
          <div className="panel-heading"><div><span className="eyebrow">SYNTHETIC MONITORING PREVIEW</span><h2>Live monitoring</h2></div><span className="shirt-demo-chip"><i /> DEMO ONLY</span></div>
          <label>Preview astronaut<select aria-label="Preview astronaut" onChange={(event) => onSelectAstronaut(event.target.value)} value={selectedAstronautId}>{crew.map((astronaut) => <option key={astronaut.id} value={astronaut.id}>{astronaut.name} · {astronaut.id}</option>)}</select></label>
        </div>
        <p className="shirt-panel-intro">Values are generated from the selected fictional profile and refresh every five seconds. They are not received from a shirt or associated with a configured sensor.</p>
        <div className="shirt-telemetry-grid">{telemetry.map((item) => <TelemetryCard item={item} key={item.id} />)}</div>
        <div className="shirt-live-lower">
          <section className="shirt-ecg-placeholder" aria-label="ECG waveform placeholder">
            <div><span className="eyebrow">ECG WAVEFORM PLACEHOLDER</span><span className="shirt-config-status">No ECG signal configured</span></div>
            <svg aria-hidden="true" viewBox="0 0 640 90" preserveAspectRatio="none"><path d="M0 46 H640" /></svg>
            <span>No waveform available · no ECG sensor data is present</span>
          </section>
          <section className="shirt-activity-status">
            <div><Activity size={16} /><span>Activity status</span></div>
            <strong>{telemetry.find((item) => item.metric === 'activity')?.value == null ? 'No synthetic sample' : `Synthetic index ${telemetry.find((item) => item.metric === 'activity').value}`}</strong>
            <small>Unitless demo index only; no activity state is inferred.</small>
          </section>
        </div>
      </section>

      <section className="shirt-sensors-section">
        <div className="shirt-section-heading"><div><span className="eyebrow">CONFIGURATION INVENTORY</span><h2>Sensor management</h2><p>Nothing is marked installed, available, or active until you configure it. Configuration does not connect hardware.</p></div><span>{configuredSensors.length} configured</span></div>
        <div className="shirt-sensor-grid">
          {SMART_SHIRT_SENSOR_CATALOG.map((sensor) => (
            <SensorCard
              key={sensor.id}
              onChange={updateSensor}
              sensor={sensor}
              value={config.sensors[sensor.id] || { configured: false, unit: '' }}
            />
          ))}
        </div>
      </section>

      <div className="shirt-management-grid">
        <DeviceSettings config={config} onRemoveAssignment={removeAssignment} onUpdate={updateDevice} crew={crew} />
        <section className="panel shirt-history-panel">
          <div className="panel-heading"><div><span className="eyebrow">EVENT LOG · DEMONSTRATION</span><h2>Device history</h2></div><History size={17} /></div>
          <label className="shirt-history-filter">Filter event type<select aria-label="Filter device history" onChange={(event) => setHistoryFilter(event.target.value)} value={historyFilter}>{SMART_SHIRT_HISTORY_FILTERS.map((filter) => <option key={filter}>{filter}</option>)}</select></label>
          <div className="shirt-history-list">
            {!events.length ? <div className="shirt-history-empty">No demo events match this filter.</div> : events.map((event) => (
              <article className="shirt-history-event" key={event.id}>
                <span className="shirt-history-icon"><Wrench size={14} /></span>
                <div><strong>{event.category}</strong><p>{event.detail}</p><time>{timestampLabel(event.timestamp)}</time></div>
                <span className="shirt-demo-label">DEMO</span>
              </article>
            ))}
          </div>
          <p className="shirt-history-note"><Cpu size={13} /> Example interface events only; they are not device logs.</p>
        </section>
      </div>
    </>
  );
}
