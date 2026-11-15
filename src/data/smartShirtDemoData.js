export const SMART_SHIRT_SENSOR_CATALOG = [
  { id: 'heart-rate', name: 'Heart Rate Sensor', type: 'Cardiovascular' },
  { id: 'spo2', name: 'SpO2 Sensor', type: 'Oxygen saturation' },
  { id: 'temperature', name: 'Temperature Sensor', type: 'Temperature' },
  { id: 'respiratory-rate', name: 'Respiratory Rate Sensor', type: 'Respiration' },
  { id: 'ecg', name: 'ECG Sensor', type: 'Electrocardiography' },
  { id: 'activity', name: 'Activity / Motion Sensor', type: 'Motion' },
  { id: 'other', name: 'Other Sensor', type: 'Unspecified' },
];

export const SMART_SHIRT_DEMO_EVENTS = [
  { id: 'event-1', category: 'Connection', timestamp: '2026-11-14T17:45:00.000Z', detail: 'Demo connection event — no physical shirt was connected.' },
  { id: 'event-2', category: 'Synchronization', timestamp: '2026-11-14T16:30:00.000Z', detail: 'Demo synchronization event — no data was transferred.' },
  { id: 'event-3', category: 'Disconnection', timestamp: '2026-11-14T15:15:00.000Z', detail: 'Demo disconnection event — no physical shirt was connected.' },
  { id: 'event-4', category: 'Sensor error', timestamp: '2026-11-14T13:40:00.000Z', detail: 'Example sensor-error entry for interface review only.' },
  { id: 'event-5', category: 'Maintenance', timestamp: '2026-11-14T11:00:00.000Z', detail: 'Example maintenance entry; no maintenance was performed.' },
  { id: 'event-6', category: 'Firmware update', timestamp: '2026-11-14T09:30:00.000Z', detail: 'Example firmware event; no device firmware was changed.' },
];

export const SMART_SHIRT_HISTORY_FILTERS = [
  'All events',
  'Connection',
  'Disconnection',
  'Synchronization',
  'Sensor error',
  'Maintenance',
  'Firmware update',
];
