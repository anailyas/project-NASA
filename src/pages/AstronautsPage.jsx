import {
  Activity, ArrowRight, Clock3, Dumbbell, HeartPulse, Radio, ShieldAlert,
  Thermometer, Wind,
} from 'lucide-react';

function displayTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleTimeString() : 'No sample';
}

function Reading({ icon: Icon, label, value, unit }) {
  return (
    <div className="crew-reading">
      <span className="crew-reading-icon"><Icon size={13} /></span>
      <div><span>{label}</span><strong>{value == null ? 'No data' : `${value}${unit ? ` ${unit}` : ''}`}</strong></div>
    </div>
  );
}

export default function AstronautsPage({ crew, readings, demoEnabled, onPreviewShirt }) {
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">CREW MONITORING / SYNTHETIC DEMO</span>
          <h1>Astronauts</h1>
          <p>Four fictional crew profiles with a locally generated preview stream. No shirt or backend is connected.</p>
        </div>
      </div>

      <div className="crew-demo-notice" role="status">
        <ShieldAlert size={16} />
        <div>
          <strong>{demoEnabled ? 'Synthetic readings refresh every 5 seconds' : 'Synthetic stream paused'}</strong>
          <span>These values are fictional interface data, not shirt measurements, medical records, or validated health guidance.</span>
        </div>
      </div>

      <div className="crew-grid">
        {crew.map((astronaut) => {
          const reading = demoEnabled ? readings[astronaut.id] : null;
          return (
            <article
              className="panel crew-card"
              key={astronaut.id}
              style={{ '--crew-color': astronaut.color }}
            >
              <div className="crew-card-heading">
                <span className="crew-avatar">{astronaut.name.split(' ').map((part) => part[0]).join('')}</span>
                <div>
                  <span className="eyebrow">{astronaut.id}</span>
                  <h2>{astronaut.name}</h2>
                  <span className="crew-role">{astronaut.role}</span>
                </div>
                <span className="crew-demo-label">DEMO</span>
              </div>

              <div className="crew-profile-facts">
                <span>Age <strong>{astronaut.age}</strong></span>
                <span>Baseline fitness <strong>{astronaut.baselineFitness}/100</strong></span>
                <span>Connection <strong>Not connected</strong></span>
              </div>

              <div className="crew-readings">
                <Reading icon={HeartPulse} label="Heart rate" value={reading?.heartRate} unit="BPM" />
                <Reading icon={Activity} label="SpO2" value={reading?.spo2} unit="%" />
                <Reading icon={Activity} label="Blood pressure" value={reading ? `${reading.systolic}/${reading.diastolic}` : null} unit={reading ? 'mmHg' : ''} />
                <Reading icon={Thermometer} label="Temperature" value={reading?.temperatureC} unit="C" />
                <Reading icon={Wind} label="Breathing rate" value={reading?.breathingRate} unit="breaths/min" />
                <Reading icon={Radio} label="Radiation dose rate" value={reading?.radiationRate} unit="uSv/h" />
                <Reading icon={Dumbbell} label="Muscle performance" value={reading?.musclePerformanceScore} unit="/100" />
              </div>

              <div className="crew-card-footer">
                <span><Clock3 size={12} /> Updated {displayTime(reading?.timestamp)}</span>
                <button className="text-button" onClick={() => onPreviewShirt(astronaut.id)} type="button">
                  Shirt preview <ArrowRight size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
