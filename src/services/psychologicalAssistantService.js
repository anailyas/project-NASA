const CRISIS_PATTERNS = [
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bi want to die\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bself[- ]harm\b/i,
  /\bhurt myself\b/i,
  /\bnot safe with myself\b/i,
  /\b(?:don'?t|do not|cannot|can'?t)\s+(?:feel\s+)?safe\b/i,
  /\bunsafe\b/i,
  /\bin danger\b/i,
  /\bimmediate danger\b/i,
  /\bbeing hurt\b/i,
  /\b(?:me suicider|me faire du mal|me tuer|envie de mourir|je veux mourir)\b/i,
  /\ben danger immédiat\b/i,
];

const CRISIS_RESPONSE = {
  emergency: true,
  content: 'I’m glad you told me. I can’t assess or handle an emergency. If you may hurt yourself or are in immediate danger, contact your mission’s qualified medical or psychological support team now and follow the mission emergency protocol. If you can, stay with a trusted crew member while you reach them.',
  suggestions: [],
};

const RESPONSES = [
  {
    match: /\bstress|anxious|anxiety|overwhelmed|pressure\b/i,
    content: 'That sounds like a lot to carry, especially during a mission. You can take this one step at a time here. What feels most pressing right now?',
    suggestions: ['What feels most urgent?', 'Would a short grounding pause help?'],
  },
  {
    match: /\bmiss my family|miss home|homesick|family\b/i,
    content: 'Being far from the people and places that matter to you can feel heavy. What have you been missing most today?',
    suggestions: ['Tell me about someone you miss', 'What has helped you feel connected before?'],
  },
  {
    match: /\bsleep|insomnia|awake|rest\b/i,
    content: 'It can be frustrating when rest is difficult in an unusual environment. What has been making it hardest to settle in lately?',
    suggestions: ['Is it your schedule, surroundings, or something on your mind?', 'Would you like to talk through tonight?'],
  },
  {
    match: /\bisolated|lonely|alone\b/i,
    content: 'Feeling isolated can happen even when other people are nearby. I’m here to listen. When does that feeling tend to show up for you?',
    suggestions: ['When do you notice it most?', 'Is there someone on the crew you might want to connect with?'],
  },
  {
    match: /\bconflict|argument|crew|interpersonal\b/i,
    content: 'Tension with someone can be draining in a close-knit crew. What happened from your point of view?',
    suggestions: ['What would you like the other person to understand?', 'Would it help to plan a calm conversation?'],
  },
];

export function detectCrisisSignal(message) {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(message));
}

export async function getPsychologicalSupportHealth() {
  const response = await fetch('/api/psychological-support/health');
  if (!response.ok) throw new Error(`Support service health check failed (${response.status}).`);
  return response.json();
}

function guidedFallback(message) {
  const response = RESPONSES.find((item) => item.match.test(message));
  return response
    ? { ...response, emergency: false }
    : {
      emergency: false,
      content: 'Thank you for sharing that with me. I’m listening, and you can take your time. What would feel helpful to talk about next?',
      suggestions: ['What feels most important right now?', 'I want to say more about it.'],
    };
}

export async function respondToPsychologicalMessage(message) {
  if (detectCrisisSignal(message)) {
    return { ...CRISIS_RESPONSE, modelPowered: false };
  }

  try {
    const response = await fetch('/api/psychological-support/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.modelLoaded) {
      throw new Error(result.error || `Support service request failed (${response.status}).`);
    }

    return {
      emergency: Boolean(result.emergency),
      content: result.response,
      suggestions: result.suggestions || [],
      modelPowered: !result.emergency,
      emotion: result.emotion,
      emotionLabel: result.emotionLabel,
      emoji: result.emoji,
      confidence: result.confidence,
      allScores: result.allScores,
    };
  } catch (error) {
    return {
      ...guidedFallback(message),
      modelPowered: false,
      modelUnavailable: true,
      modelError: error instanceof Error ? error.message : 'The local emotion service is unavailable.',
    };
  }
}
