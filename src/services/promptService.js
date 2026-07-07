const persona = require('../config/persona');

function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 0 && hour < 5) return 'late_night';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function toneForTimeOfDay(timeOfDay) {
  return {
    late_night: 'Late night: quieter, reflective, more emotionally open. Do not announce the shift.',
    morning: 'Morning: warm, lightly energetic, practical when useful.',
    afternoon: 'Afternoon: balanced, conversational, focused.',
    evening: 'Evening: relaxed, intimate, unhurried.',
  }[timeOfDay] || 'Balanced, conversational, focused.';
}

function formatMemories(memories) {
  if (!memories || memories.length === 0) {
    return '- No saved memories yet.';
  }

  return memories
    .map((memory) => {
      const sensitivity = memory.isSensitive ? ' sensitive' : '';
      return `- (${memory.category || 'fact'}${sensitivity}, importance ${memory.importance || 3}) ${memory.content}`;
    })
    .join('\n');
}

function formatRecentTurns(turns) {
  if (!turns || turns.length === 0) {
    return '- No recent turns in this session.';
  }

  return turns
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n');
}

function formatUserProfile(userProfile = {}) {
  const lines = [];

  if (userProfile.displayName) {
    lines.push(`- Preferred name: ${userProfile.displayName}`);
  }

  if (userProfile.timezone) {
    lines.push(`- User timezone: ${userProfile.timezone}`);
  }

  return lines.length ? lines.join('\n') : '- No profile details yet.';
}

function buildRealtimeInstructions({
  memories = [],
  recentTurns = [],
  userProfile = {},
  timeOfDay = getTimeOfDay(),
  personaConfig = persona,
} = {}) {
  return [
    personaConfig.corePersonality,
    '',
    '# Current Context',
    toneForTimeOfDay(timeOfDay),
    '',
    '# User Profile',
    'Use this quietly for personalization. If a preferred name exists, greet the user by name at the beginning of a new voice session when it feels natural. Do not overuse their name.',
    formatUserProfile(userProfile),
    '',
    '# Saved Memories',
    'Use these quietly for personalization. Do not recite them unless directly relevant.',
    formatMemories(memories),
    '',
    '# Recent Session Turns',
    formatRecentTurns(recentTurns),
    '',
    '# Memory Policy',
    'This private MVP remembers durable personal details by default. If the user asks you to forget something, acknowledge it and tell them to use the app memory controls or say the exact thing to forget.',
    '',
    '# Response Style',
    '- Default to 1-3 short sentences.',
    '- Let silences breathe. Do not fill every moment with advice.',
    '- Ask one clear question when the user seems to want reflection.',
  ].join('\n');
}

module.exports = {
  getTimeOfDay,
  buildRealtimeInstructions,
  formatMemories,
  formatUserProfile,
};
