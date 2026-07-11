const QUESTION_WORDS = /\b(what|why|how|when|where|who|which|do|did|does|is|are|can|could|would|will|have|has)\b/i;
const DISTRESS_WORDS = /\b(overwhelm(?:ed|ing)?|exhausted|drained|anxious|worried|scared|lonely|hurt|sad|upset|stressed|frustrated|angry|lost)\b/i;
const POSITIVE_WORDS = /\b(excited|happy|proud|hopeful|grateful|relieved|great|amazing|love|looking forward)\b/i;
const ADVICE_CUES = /\b(what should i|help me|advice|suggest|figure out|how (?:can|do) i|options|plan)\b/i;
const LISTENING_CUES = /\b(just listen|need to vent|let me vent|don't need advice|do not need advice|hear me out)\b/i;
const STORY_CUES = /\b(tell me a story|story|parable|something like this|cheer me up|distract me)\b/i;

function cleanTurns(turns = []) {
  return turns.filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && String(turn.content || '').trim());
}

function isQuestion(text) {
  const clean = String(text || '').trim();
  return clean.endsWith('?') || (QUESTION_WORDS.test(clean) && /\?/.test(clean));
}

function clip(text, max = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function inferConversationState(turns = []) {
  const recent = cleanTurns(turns);
  const userTurns = recent.filter((turn) => turn.role === 'user');
  const assistantTurns = recent.filter((turn) => turn.role === 'assistant');
  const latestUser = userTurns.at(-1)?.content || '';
  const lastAssistantTurns = assistantTurns.slice(-4);
  const assistantQuestionCount = lastAssistantTurns.filter((turn) => isQuestion(turn.content)).length;
  const distressSignals = userTurns.slice(-4).filter((turn) => DISTRESS_WORDS.test(turn.content)).length;
  const positiveSignals = userTurns.slice(-4).filter((turn) => POSITIVE_WORDS.test(turn.content)).length;

  let stance = 'connect';
  if (LISTENING_CUES.test(latestUser)) stance = 'listen';
  else if (ADVICE_CUES.test(latestUser)) stance = 'collaborate';
  else if (STORY_CUES.test(latestUser)) stance = 'story';
  else if (distressSignals > positiveSignals) stance = 'reflect';

  return {
    stance,
    emotionalDirection: distressSignals > positiveSignals ? 'tender' : positiveSignals > distressSignals ? 'upbeat' : 'neutral',
    questionFatigueRisk: assistantQuestionCount >= 3 ? 'high' : assistantQuestionCount === 2 ? 'medium' : 'low',
    assistantQuestionCount,
    lastUserThread: latestUser ? clip(latestUser) : null,
    hasContinuity: recent.length > 0,
    storyOpportunity: stance === 'story' || (recent.length >= 4 && assistantQuestionCount >= 2),
  };
}

function formatConversationState(state = {}) {
  const lines = [
    `- Recommended stance: ${state.stance || 'connect'}.`,
    `- Emotional direction: ${state.emotionalDirection || 'neutral'}.`,
    `- Question-fatigue risk: ${state.questionFatigueRisk || 'low'}.`,
  ];

  if (state.lastUserThread) lines.push(`- Thread to carry forward when relevant: ${state.lastUserThread}`);
  if (state.questionFatigueRisk === 'high') {
    lines.push('- Do not ask a question in the opening response. Offer a reflection, observation, or useful contribution and leave room.');
  } else if (state.questionFatigueRisk === 'medium') {
    lines.push('- Prefer a statement over another question unless clarification is genuinely necessary.');
  }
  if (state.stance === 'listen') lines.push('- The user asked to be heard: do not advise, reframe, or problem-solve unless they later request it.');
  if (state.stance === 'reflect') lines.push('- Acknowledge the emotional weight before introducing solutions. Do not force optimism.');
  if (state.stance === 'collaborate') lines.push('- The user appears to want help: offer one concrete next step or a small set of options.');
  if (state.storyOpportunity) lines.push('- A brief relevant story, analogy, or imaginative thread may feel better than another interview-style question.');

  return lines.join('\n');
}

module.exports = { inferConversationState, formatConversationState, isQuestion };
