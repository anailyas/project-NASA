import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Clock3, HeartHandshake, LockKeyhole, Plus, Send, ShieldAlert,
  Trash2, UserRound, X,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { astronaut } from '../data/mission.js';
import { PSYCHOLOGICAL_MODEL_INFO } from '../data/psychologicalModelInfo.js';
import {
  detectCrisisSignal, getPsychologicalSupportHealth, respondToPsychologicalMessage,
} from '../services/psychologicalAssistantService.js';

const STARTERS = [
  'I’m feeling stressed.',
  'I miss my family.',
  'I’m having trouble sleeping.',
  'I feel isolated.',
  'I want to talk about something.',
  'I’m feeling overwhelmed.',
];

const MOODS = ['Happy', 'Calm', 'Neutral', 'Stressed', 'Anxious', 'Sad', 'Exhausted'];

function createConversation() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'New conversation',
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

function timeLabel(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(value) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function moodSequence(checkins) {
  return checkins.slice(-3).map((checkin) => checkin.mood).join(' → ') || 'No check-ins yet';
}

function MessageBubble({ message, onSuggestion, disabled }) {
  const isAssistant = message.role === 'assistant';
  return (
    <article className={`psych-message ${isAssistant ? 'psych-message-assistant' : 'psych-message-user'}`}>
      <span className="psych-message-avatar">{isAssistant ? <HeartHandshake size={15} /> : <UserRound size={15} />}</span>
      <div className="psych-message-body">
        <div className="psych-message-meta">
          <strong>{isAssistant ? 'Local support assistant' : 'You'}</strong>
          <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
        </div>
        <p>{message.content}</p>
        {isAssistant && message.modelPowered && message.emotion && (
          <div className="psych-emotion-estimate">
            <span>TEXT EMOTION ESTIMATE</span>
            <strong>{message.emoji} {message.emotionLabel} · {message.confidence}%</strong>
            <small>A model score, not a psychological assessment.</small>
          </div>
        )}
        {isAssistant && <span className={`psych-demo-reply ${message.modelPowered ? 'psych-model-reply' : ''}`}>{message.modelPowered ? 'LOCAL MODEL · SUPPORTIVE PROMPT' : message.emergency ? 'SAFETY GUIDANCE · NO CLASSIFICATION' : 'GUIDED FALLBACK · MODEL OFFLINE'}</span>}
        {message.suggestions?.length > 0 && (
          <div className="psych-followups">
            {message.suggestions.map((suggestion) => (
              <button className="psych-followup" disabled={disabled} key={suggestion} onClick={() => onSuggestion(suggestion)} type="button">{suggestion}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function PsychologicalModelPanel({ modelStatus }) {
  const connected = modelStatus === 'ready';
  return (
    <section className="panel psych-model-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">SUPPLIED MODEL & DATA</span><h2>{PSYCHOLOGICAL_MODEL_INFO.name} emotion classifier</h2></div>
        <span className={`psych-model-state ${connected ? 'psych-model-state-ready' : ''}`}>{connected ? 'LOCAL · READY' : 'LOCAL · OFFLINE'}</span>
      </div>
      <p className="psych-model-description">Text-only estimates across six emotion labels. The model does not diagnose, assess risk, or determine anyone’s mental health.</p>
      {!connected && <p className="psych-model-offline-hint">Start the local Python service on port 8000 and install its model dependencies to enable classification.</p>}
      <div className="psych-model-metrics">
        <div><span>TRAINING EXAMPLES</span><strong>{PSYCHOLOGICAL_MODEL_INFO.trainingExamples.toLocaleString()}</strong></div>
        <div><span>TEST EXAMPLES</span><strong>{PSYCHOLOGICAL_MODEL_INFO.testExamples.toLocaleString()}</strong></div>
        <div><span>REPORTED ACCURACY</span><strong>{PSYCHOLOGICAL_MODEL_INFO.accuracyPercent}%</strong></div>
        <div><span>WEIGHTED F1</span><strong>{PSYCHOLOGICAL_MODEL_INFO.weightedF1Percent}%</strong></div>
      </div>
      <img className="psych-confusion-matrix" src={PSYCHOLOGICAL_MODEL_INFO.confusionMatrix} alt="Confusion matrix for the supplied six-emotion test evaluation" />
      <p className="psych-model-disclaimer">Metrics and matrix are from the supplied model files’ held-out evaluation. They are not independent, clinical, or mission validation. Local replies use short templates; no cloud LLM is called.</p>
    </section>
  );
}

function MoodCheckIn({ checkins, onSave }) {
  const [mood, setMood] = useState('');
  const [includeStress, setIncludeStress] = useState(false);
  const [stress, setStress] = useState(5);
  const [savedMessage, setSavedMessage] = useState('');

  function submit(event) {
    event.preventDefault();
    if (!mood) return;
    onSave({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mood,
      stressLevel: includeStress ? Number(stress) : null,
      createdAt: new Date().toISOString(),
    });
    setMood('');
    setIncludeStress(false);
    setSavedMessage('Check-in added to this browser session.');
    window.setTimeout(() => setSavedMessage(''), 2200);
  }

  const chartData = useMemo(() => checkins
    .filter((checkin) => checkin.stressLevel != null)
    .slice(-12)
    .map((checkin) => ({
      label: dateLabel(checkin.createdAt),
      value: checkin.stressLevel,
      mood: checkin.mood,
      createdAt: checkin.createdAt,
    })), [checkins]);

  const recent = checkins.slice(-3);
  const recentScores = checkins.filter((checkin) => checkin.stressLevel != null).slice(-2);
  const reportedTrend = recentScores.length < 2
    ? 'Not enough reported stress scores to compare'
    : recentScores[1].stressLevel === recentScores[0].stressLevel
      ? 'Reported stress level is unchanged'
      : `Reported stress ${recentScores[1].stressLevel < recentScores[0].stressLevel ? 'decreased' : 'increased'} by ${Math.abs(recentScores[1].stressLevel - recentScores[0].stressLevel)}`;

  return (
    <section className="panel mood-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">OPTIONAL · VOLUNTARY</span><h2>Emotional check-in</h2></div>
        <HeartHandshake size={18} className="mood-panel-icon" />
      </div>
      <p className="mood-intro">Choose what best describes how you feel right now. This does not assess or infer a psychological condition.</p>
      <form className="mood-form" onSubmit={submit}>
        <fieldset>
          <legend>Current mood</legend>
          <div className="mood-options">
            {MOODS.map((option) => (
              <button
                aria-pressed={mood === option}
                className={`mood-option ${mood === option ? 'mood-option-selected' : ''}`}
                key={option}
                onClick={() => setMood(option)}
                type="button"
              >{option}</button>
            ))}
          </div>
        </fieldset>
        <label className="stress-toggle">
          <input checked={includeStress} onChange={(event) => setIncludeStress(event.target.checked)} type="checkbox" />
          <span>Add an optional self-reported stress level</span>
        </label>
        {includeStress && (
          <label className="stress-slider">
            <span>Stress level <strong>{stress} / 10</strong></span>
            <input aria-label="Self-reported stress level from 1 to 10" min="1" max="10" onChange={(event) => setStress(event.target.value)} type="range" value={stress} />
            <small>1 = lowest · 10 = highest · Your own rating only</small>
          </label>
        )}
        <div className="mood-submit-row">
          <button className="button button-primary" disabled={!mood} type="submit">Save check-in</button>
          {savedMessage && <span role="status" className="mood-saved">{savedMessage}</span>}
        </div>
      </form>

      <div className="mood-history">
        <div className="mood-history-heading"><div><span className="eyebrow">SESSION-ONLY HISTORY</span><h3>Reported stress trend</h3></div><span className="mood-history-count">{checkins.length} check-in{checkins.length === 1 ? '' : 's'}</span></div>
        {chartData.length ? (
          <div className="mood-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#1b2b3a" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#778b9f', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fill: '#778b9f', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#101d2b', border: '1px solid #31495d', borderRadius: 7, fontSize: 10 }}
                  formatter={(value, _name, item) => [`${value} / 10 · ${item.payload.mood}`, 'Reported stress']}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.createdAt ? new Date(payload[0].payload.createdAt).toLocaleString() : ''}
                />
                <Line dataKey="value" name="Reported stress" stroke="#a9a0f4" strokeWidth={2} dot={{ r: 3, fill: '#c4b8ff' }} activeDot={{ r: 5 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mood-chart-empty">Stress history appears here only when you choose to include a rating.</div>
        )}
        <div className="mood-trend-summary"><span>Recent mood sequence</span><strong>{moodSequence(checkins)}</strong><small>{reportedTrend}; no condition is inferred.</small></div>
        <div className="mood-history-list">
          {!recent.length ? <span className="muted-copy">No check-ins recorded in this session.</span> : recent.slice().reverse().map((checkin) => (
            <div className="mood-history-row" key={checkin.id}><span>{checkin.mood}</span><small>{checkin.stressLevel == null ? 'No stress score' : `Self-reported stress ${checkin.stressLevel}/10`}</small><time>{timeLabel(checkin.createdAt)}</time></div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PsychologicalSupport({ active, checkins, onSaveCheckin }) {
  const [conversations, setConversations] = useState(() => [createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id);
  const [input, setInput] = useState('');
  const [typingConversationId, setTypingConversationId] = useState(null);
  const [modelStatus, setModelStatus] = useState('checking');
  const [welcomeCreatedAt] = useState(() => new Date().toISOString());
  const messageEndRef = useRef(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0];
  const messages = activeConversation?.messages || [];
  const emergencyActive = messages.some((message) => message.emergency);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversationId, messages, typingConversationId]);

  useEffect(() => {
    if (!active) return undefined;
    let isCurrent = true;
    async function checkModel() {
      try {
        const health = await getPsychologicalSupportHealth();
        if (isCurrent) setModelStatus(health.modelLoaded ? 'ready' : 'offline');
      } catch {
        if (isCurrent) setModelStatus('offline');
      }
    }
    void checkModel();
    const intervalId = window.setInterval(checkModel, 15000);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [active]);

  function startConversation() {
    const conversation = createConversation();
    setConversations((current) => [...current, conversation]);
    setActiveConversationId(conversation.id);
    setInput('');
  }

  function clearConversation() {
    if (!activeConversation || !window.confirm('Clear every message in this conversation? This cannot be undone.')) return;
    setConversations((current) => current.map((conversation) => (
      conversation.id === activeConversation.id
        ? { ...conversation, title: 'New conversation', messages: [], updatedAt: new Date().toISOString() }
        : conversation
    )));
    setInput('');
  }

  function deleteConversation(conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation || !window.confirm(`Delete “${conversation.title}” from this session?`)) return;
    const remaining = conversations.filter((item) => item.id !== conversationId);
    if (!remaining.length) {
      const replacement = createConversation();
      setConversations([replacement]);
      setActiveConversationId(replacement.id);
    } else {
      setConversations(remaining);
      if (conversationId === activeConversationId) setActiveConversationId(remaining[0].id);
    }
    if (typingConversationId === conversationId) setTypingConversationId(null);
    setInput('');
  }

  async function sendMessage(rawText = input) {
    const text = rawText.trim();
    if (!text || typingConversationId || !activeConversation) return;
    const targetId = activeConversation.id;
    const createdAt = new Date().toISOString();
    const emergency = detectCrisisSignal(text);
    const userMessage = { role: 'user', content: text, createdAt, emergency };
    setConversations((current) => current.map((conversation) => (
      conversation.id === targetId
        ? {
          ...conversation,
          title: conversation.messages.length ? conversation.title : text.slice(0, 40),
          messages: [...conversation.messages, userMessage],
          updatedAt: createdAt,
        }
        : conversation
    )));
    setInput('');
    setTypingConversationId(targetId);
    try {
      const response = await respondToPsychologicalMessage(text);
      const assistantMessage = {
        role: 'assistant',
        content: response.content,
        suggestions: response.suggestions,
        emergency: response.emergency,
        modelPowered: response.modelPowered,
        emotion: response.emotion,
        emotionLabel: response.emotionLabel,
        emoji: response.emoji,
        confidence: response.confidence,
        createdAt: new Date().toISOString(),
      };
      if (response.modelPowered) setModelStatus('ready');
      else if (response.modelUnavailable) setModelStatus('offline');
      setConversations((current) => current.map((conversation) => (
        conversation.id === targetId
          ? { ...conversation, messages: [...conversation.messages, assistantMessage], updatedAt: assistantMessage.createdAt }
          : conversation
      )));
    } finally {
      setTypingConversationId(null);
    }
  }

  return (
    <>
      <div className="section-title psych-section-title">
        <div>
          <span className="eyebrow">CREW WELL-BEING · LOCAL SUPPORT</span>
          <h1>AI Psychological Support</h1>
          <p>A calm place to reflect. Local model estimates are tentative text cues—not diagnoses or mental-health assessments.</p>
        </div>
        <div aria-live="polite" className={`psych-demo-status ${modelStatus === 'ready' ? 'psych-model-status-ready' : ''}`} role="status"><span />{modelStatus === 'checking' ? 'CHECKING LOCAL MODEL' : modelStatus === 'ready' ? 'LOCAL MODEL · CONNECTED' : 'MODEL OFFLINE · GUIDED FALLBACK'}</div>
      </div>

      <div className="psych-welcome-banner">
        <HeartHandshake size={19} />
        <div><strong>Supportive listening, not clinical care</strong><span>When available, the local classifier estimates text emotion and selects a short supportive prompt. Messages are not saved or sent to a cloud AI service.</span></div>
      </div>

      <div className="psych-layout">
        <aside className="psych-history-panel panel">
          <div className="psych-history-heading"><div><span className="eyebrow">SESSION HISTORY</span><h2>Conversations</h2></div><button aria-label="Start a new conversation" className="icon-button" onClick={startConversation} type="button"><Plus size={17} /></button></div>
          <button className="button button-secondary psych-new-button" onClick={startConversation} type="button"><Plus size={15} /> New conversation</button>
          <div className="psych-conversation-list">
            {conversations.slice().reverse().map((conversation) => (
              <div className={`psych-conversation-item ${conversation.id === activeConversation?.id ? 'psych-conversation-active' : ''}`} key={conversation.id}>
                <button className="psych-conversation-select" onClick={() => { setActiveConversationId(conversation.id); setInput(''); }} type="button">
                  <strong>{conversation.title}</strong>
                  <small>{conversation.messages.length ? `${conversation.messages.length} messages · ${timeLabel(conversation.updatedAt)}` : 'No messages yet'}</small>
                </button>
                <button aria-label={`Delete ${conversation.title}`} className="psych-history-delete" disabled={typingConversationId === conversation.id} onClick={() => deleteConversation(conversation.id)} type="button"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="psych-session-note"><Clock3 size={14} /><span>History exists only while this page session remains open.</span></div>
        </aside>

        <section className="panel psych-chat-panel">
          <header className="psych-chat-header">
            <div className="psych-assistant-avatar"><HeartHandshake size={18} /></div>
            <div><strong>Support assistant</strong><span><i /> {modelStatus === 'ready' ? 'Local emotion model connected' : 'Guided fallback · local model unavailable'}</span></div>
            <div className="psych-chat-actions">
              <span className="psych-private-label"><LockKeyhole size={13} /> SESSION-ONLY</span>
              <button aria-label="Clear conversation" className="icon-button" disabled={!messages.length || typingConversationId === activeConversation?.id} onClick={clearConversation} title="Clear conversation" type="button"><Trash2 size={15} /></button>
            </div>
          </header>
          <div aria-live="polite" className="psych-message-list">
            {!messages.length && (
              <div className="psych-welcome-message">
                <div className="psych-welcome-copy">
                  <span className="psych-message-avatar"><HeartHandshake size={15} /></span>
                  <div className="psych-message-body">
                    <div className="psych-message-meta"><strong>Support assistant</strong><time>{timeLabel(welcomeCreatedAt)}</time></div>
                    <p>Hello! I'm here to listen. Space missions can be challenging, and you don't have to face every difficulty alone. How are you feeling today?</p>
                    <span className="psych-demo-reply">SUPPORTIVE LISTENING · NOT CLINICAL CARE</span>
                  </div>
                </div>
                <div className="psych-starters"><span>YOU CAN START WITH</span>{STARTERS.map((starter) => <button disabled={typingConversationId != null} key={starter} onClick={() => sendMessage(starter)} type="button">{starter}<ArrowRight size={13} /></button>)}</div>
              </div>
            )}
            {messages.map((message, index) => <MessageBubble disabled={typingConversationId != null} key={`${message.createdAt}-${index}`} message={message} onSuggestion={sendMessage} />)}
            {emergencyActive && (
              <div className="psych-emergency panel" role="alert">
                <ShieldAlert size={18} />
                <div><strong>Immediate support may be needed</strong><p>Contact the mission’s qualified medical or psychological support team now and follow the mission emergency protocol. This demo cannot independently assess or manage an emergency.</p></div>
              </div>
            )}
            {typingConversationId === activeConversation?.id && <div className="psych-typing"><span /><span /><span />{modelStatus === 'ready' ? ' Running the local emotion model…' : ' Preparing a guided fallback…'}</div>}
            <div ref={messageEndRef} />
          </div>
          <form className="psych-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <label className="sr-only" htmlFor="psych-message-input">Message the support assistant</label>
            <textarea
              id="psych-message-input"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Write what’s on your mind…"
              rows="2"
              value={input}
            />
            <button aria-label="Send message" className="button button-primary" disabled={!input.trim() || typingConversationId != null} type="submit"><Send size={15} /> Send</button>
          </form>
          <div className="psych-compose-foot"><span>Enter to send · Shift + Enter for a new line</span>{typingConversationId === activeConversation?.id && <span>Assistant is responding</span>}</div>
        </section>

        <aside className="psych-support-side">
          <MoodCheckIn checkins={checkins} onSave={onSaveCheckin} />
          <PsychologicalModelPanel modelStatus={modelStatus} />
          <section className="panel psych-privacy-panel">
            <div className="panel-heading"><div><span className="eyebrow">PRIVACY & DATA</span><h2>Your session</h2></div><LockKeyhole size={17} /></div>
            <ul>
              <li>When the bundled backend is connected, messages are sent only to it for local inference and are not persisted or forwarded. Offline guided replies run in this page. Check-ins stay in browser memory.</li>
              <li>There is no public sharing. Clearing or deleting a conversation removes it from the current session.</li>
              <li>This interface does not provide end-to-end encryption or guarantee confidentiality. Use only on a trusted machine and avoid identifying details.</li>
            </ul>
            <div className="psych-privacy-footer"><X size={13} /> Not encrypted · not clinical care</div>
          </section>
          <section className="panel psych-care-panel">
            <ShieldAlert size={17} />
            <div><strong>Need qualified support?</strong><p>Contact your mission’s medical or psychological support team. For an emergency, follow the mission emergency protocol.</p></div>
          </section>
        </aside>
      </div>
      <p className="psych-profile-context">Session for {astronaut.name} · fictional demonstration profile. The general dashboard shows only voluntary mood labels and dates, never conversation content.</p>
    </>
  );
}
