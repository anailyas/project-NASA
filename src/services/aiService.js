import { DATASETS } from '../data/datasets.js';
import { createClient } from './api.js';

const DISCLAIMER = 'Demonstration response only. This is not a medical diagnosis, a treatment plan, or a flight-surgeon call.';

export async function requestAssistant({ message, context, settings, forceDemo = false }) {
  const endpoint = settings.ai.endpoint.trim().replace(/\/$/, '');
  if (!forceDemo && endpoint) {
    try {
      const client = createClient(endpoint);
      const response = await client.post('/api/ai/chat', {
        message,
        model: settings.ai.model || null,
        context,
      });
      return {
        kind: 'backend',
        content: response.data.reply || 'The server returned an empty reply.',
        disclaimer: response.data.disclaimer || DISCLAIMER,
      };
    } catch (error) {
      const detail = error.response?.data?.detail || error.message || 'The request failed.';
      return {
        kind: 'error',
        content: `The configured endpoint did not return an analysis. ${detail} Clear the AI endpoint in Settings to use the demo responder, or send a demo reply from this page.`,
        disclaimer: null,
      };
    }
  }
  return { kind: 'demo', ...demoReply(message, context) };
}

export function demoReply(message, context) {
  const question = message.toLowerCase();
  const lines = [];

  if (/diagnos|treat|prescri|medic|clear the crew|flight surgeon/.test(question)) {
    lines.push('This responder cannot diagnose, treat, prescribe, or clear a person for duty. A flight surgeon has to review primary records.');
  }

  if (/animal|mouse|murine|osd-661|osd-662|soleus/.test(question)) {
    const spine = DATASETS.find((item) => item.id === 'OSD-661');
    const soleus = DATASETS.find((item) => item.id === 'OSD-662');
    lines.push(`${spine.name}: ${spine.organism}. ${spine.description}`);
    lines.push(`${soleus.name}: ${soleus.organism}. ${soleus.description}`);
  }

  if (/radlab|radiation/.test(question)) {
    const radiation = context.latest?.find((item) => item.key === 'radiation');
    if (!radiation?.text) {
      lines.push('No radiation measurement is available in the selected source. NASA RadLab has not been queried.');
    } else if (context.provenance === 'SYNTHETIC_DEMO') {
      lines.push(`Selected radiation value: ${radiation.text} ${radiation.unit} (${radiation.status}). It is marked SYNTHETIC_DEMO and is not a RadLab reading.`);
    } else {
      lines.push(`Selected radiation column: ${radiation.text} ${radiation.unit} (${radiation.status}). This is the imported file, not a live RadLab feed.`);
    }
  }

  const wantsSummary = /spo2|oxygen|heart|temp|sleep|pressure|trend|status|risk|summary|latest|how is/.test(question);
  if (wantsSummary || lines.length === 0) {
    const present = (context.latest || []).filter((item) => item.text);
    const absent = (context.latest || []).filter((item) => !item.text).map((item) => item.label);
    if (!present.length) {
      lines.push('No Data Available. The selected source has no numeric measurements for the monitored channels.');
    } else {
      lines.push(`Latest labeled values from ${context.sourceLabel} (${context.dataClass || 'class not set'}): ${present.map((item) => `${item.label} ${item.text} ${item.unit}, ${item.status}`).join('; ')}.`);
      if (absent.length) lines.push(`No measurement for: ${absent.join(', ')}.`);
    }
    if (context.openAlerts?.length) {
      lines.push(`Open threshold events: ${context.openAlerts.slice(0, 6).map((alert) => `${alert.parameter} ${alert.severity} at ${alert.valueText}`).join('; ')}.`);
    } else {
      lines.push('No open warning or critical events are waiting in the selected source.');
    }
  }

  if (context.trends?.length) {
    const ready = context.trends.filter((trend) => trend.delta != null);
    if (ready.length && /trend|summary|risk|compare/.test(question)) {
      lines.push(`24-hour means versus the prior 24 hours: ${ready.map((trend) => `${trend.label} ${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(2)} ${trend.unit}`).join('; ')}. Windows with no numeric samples are omitted rather than filled with zero.`);
    }
  }

  lines.push('Review the timestamp, sample id, unit, and data class before you brief anyone. Do not treat this text as a medical finding.');
  return { content: lines.join('\n\n'), disclaimer: DISCLAIMER };
}
