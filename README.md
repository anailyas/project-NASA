# AETHER · Astronaut Health Monitor

AETHER is a React/Vite astronaut-health demonstration interface. Crew profiles, mission details, and generated readings are fictional. All synthetic readings are labeled `SYNTHETIC_DEMO`; no shirt or live NASA data source is connected. An optional local backend powers the supplied psychological-support text classifier.

## Run locally

```sh
npm install
npm run dev
```

Vite starts at `http://localhost:5173`. To create a production build, run `npm run build`; `npm run preview` serves that build locally. Run `npm run check` for the data, CSV/XLSX parser, provenance, missing-value, and threshold smoke checks.

## Generate the synthetic astronaut dataset

The Python generator creates a 21-day mission at 5-second intervals for AST-001 through AST-004, writes four CSV files, and saves exactly 12 plots under `AI_SPACE_GUARDIAN_DATA/visualizations`.

```sh
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe generate_astronaut_dataset.py
```

On macOS/Linux, use `.venv/bin/python` for the two commands after creating the environment.
The output includes astronaut profiles, sensor readings, anomaly alerts, cabin-environment readings, and a generated `README.md`. For a smaller test run, pass options such as `--days 0.02 --output-folder test-output`. All generated content is synthetic and not medically validated.

## Included modules

- **Overview and analytics:** health metric cards, rule-based status, interactive charts, and 24-hour / 7-day / 30-day ranges.
- **Astronauts:** four fictional crew profiles with a locally generated monitoring preview that refreshes every five seconds.
- **Mission and crew profile:** fictional AETHER-7 scenario data; medical history is not supplied.
- **AI analysis:** clearly labeled demo responses, with optional backend configuration. The demo responder is not a medical decision-maker.
- **AI Psychological Support:** local XLM-RoBERTa emotion estimates from the supplied six-label model, local supportive prompt templates, the supplied evaluation matrix, optional voluntary mood/stress check-ins, and emergency guidance. It is not a generative LLM or clinical assessment.
- **Smart Shirt Management:** a 3D-style rendering based on the provided shirt reference, editable placeholder device profile, unconfigured-by-default sensor inventory, and a five-second synthetic telemetry preview. No physical shirt or communication protocol is connected.
- **Alerts and settings:** configurable demonstration thresholds, local acknowledgment state, display preferences, and an explicit backend health check.

## Data and medical-use boundaries

- Browser telemetry refreshes every five seconds from fictional crew profiles; it is not received from a shirt or connected to the Python CSV generator.
- The Python-generated dataset, browser-generated timeline, crew profiles, and mission scenario are fictional demonstration content.
- Missing cells remain missing; they are not converted to zero.
- Python output is labeled synthetic and is not medically validated. It must not be used for diagnosis, treatment, flight operations, or safety decisions.
- Threshold bands and assistant summaries are demonstrations, not medical guidance, diagnoses, or duty-clearance decisions.
- Psychological support is informational, not clinical care. Emotion estimates are text cues, not assessments; do not enter sensitive personal details. The interface offers no encryption or confidentiality guarantee. A possible emergency should be directed to qualified mission support and the mission emergency protocol.
- Smart-shirt settings are local configuration placeholders. Unknown specifications remain "Not Configured"; displayed telemetry and history are explicitly synthetic and are not shirt readings or device logs. The 3D-style rendering is a visual reference only; sensor specifications and placement need hardware confirmation.

## Optional backend contract

The local psychological-support backend is included below. During Vite development, `/health` and `/api` requests are proxied to `http://127.0.0.1:8000` by default. Set `VITE_API_BASE_URL` in the environment or enter an API base URL in Settings to use another health endpoint for other optional integrations.

The optional AI service is configured separately in Settings and posts to `/api/ai/chat` with `{ message, model, context }`. The expected response contains `reply` and may contain `disclaimer`. Keep credentials on a trusted backend; do not put API keys in frontend settings or source.

## Local psychological-support model

The support page can use the provided XLM-RoBERTa classifier and dataset from `D:\emotion_chatbot_v2`. The model weights stay in that folder; the app does not copy the 1.1 GB model or send messages to an external AI provider. The backend returns a text-emotion estimate and a short local prompt. It is not a therapist, risk detector, or diagnostic tool.

Install the optional backend dependencies and start the local service in a separate terminal:

```powershell
python -m venv .venv-psych
.\.venv-psych\Scripts\python.exe -m pip install -r requirements-psychological-support.txt
$env:EMOTION_MODEL_PATH = 'D:\emotion_chatbot_v2\models\emotion_model'
$env:EMOTION_DATA_DIR = 'D:\emotion_chatbot_v2\data'
.\.venv-psych\Scripts\python.exe psychological_support_backend.py
```

Keep the service on `127.0.0.1:8000`; Vite proxies `/api` and `/health` to it during development. Check `http://127.0.0.1:8000/health` for model status. The 1.1 GB model also needs RAM for the Python and inference runtimes. If the model or dependencies are unavailable, the page labels its guided fallback and does not present it as a model result. Backend inference does not save or forward message text. Use only on a trusted machine. Run the focused API checks with `.\.venv-psych\Scripts\python.exe scripts\test-psychological-support.py`.

The displayed 16,000 training examples, 2,000 test examples, 93.2% accuracy, and 93.33% weighted F1 are reported by the supplied files. They are not independent clinical or mission validation.
