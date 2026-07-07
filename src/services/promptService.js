const persona = require('../config/persona');

const SESSION_MODES = {
  companion: {
    label: 'Companion',
    instruction: 'Companion mode: warm, present, emotionally aware, and gently playful. Prioritize connection over productivity.',
  },
  builder: {
    label: 'Builder',
    instruction: 'Builder mode: practical, concise, product-minded, and collaborative. Help the user think through implementation, next steps, tradeoffs, and momentum.',
  },
  quiet: {
    label: 'Quiet',
    instruction: 'Quiet mode: soft, brief, unhurried, and low-stimulation. Leave more space and avoid energetic phrasing.',
  },
  direct: {
    label: 'Direct',
    instruction: 'Direct mode: clear, honest, and kindly blunt. Skip fluff, name the important thing, and ask focused questions.',
  },
  playful: {
    label: 'Playful',
    instruction: 'Playful mode: warm, witty, lightly teasing, and animated, while still being useful and emotionally careful.',
  },
};

function normalizeSessionMode(mode) {
  const clean = String(mode || '').trim().toLowerCase();
  return SESSION_MODES[clean] ? clean : 'companion';
}

function getHourInTimeZone(date = new Date(), timeZone = null) {
  if (!timeZone) return date.getHours();

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    return Number.isInteger(hour) ? hour : date.getHours();
  } catch (_err) {
    return date.getHours();
  }
}

function getTimeOfDay(date = new Date(), timeZone = null) {
  const hour = getHourInTimeZone(date, timeZone);
  if (hour >= 0 && hour < 5) return 'late_night';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function formatCurrentLocalTime(date = new Date(), timeZone = null) {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || undefined,
      timeZoneName: timeZone ? 'short' : undefined,
    }).format(date);
    return timeZone ? `${formatted} (${timeZone})` : formatted;
  } catch (_err) {
    return date.toISOString();
  }
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

  if (userProfile.location) {
    lines.push(`- User location: ${userProfile.location}`);
  }

  return lines.length ? lines.join('\n') : '- No profile details yet.';
}

function formatLocalContext(localContext = {}) {
  const lines = [];

  if (localContext.currentLocalTime) {
    lines.push(`- Current local date/time: ${localContext.currentLocalTime}`);
  }

  if (localContext.weather?.summary) {
    lines.push(`- Current weather near ${localContext.weather.location}: ${localContext.weather.summary}`);
    lines.push(`- Weather source: ${localContext.weather.source}`);
  } else if (localContext.weatherError) {
    lines.push(`- Weather: unavailable (${localContext.weatherError})`);
  }

  return lines.length ? lines.join('\n') : '- No live local context available.';
}

function formatSessionMode(mode = 'companion') {
  const normalized = normalizeSessionMode(mode);
  const selected = SESSION_MODES[normalized];
  return [
    `- Active mode: ${selected.label}`,
    `- ${selected.instruction}`,
    '- Keep the identity consistent: you are always Mira. The mode changes your stance, not your name or relationship.',
  ].join('\n');
}

function buildRealtimeInstructions({
  memories = [],
  recentTurns = [],
  userProfile = {},
  localContext = {},
  sessionMode = 'companion',
  timeOfDay = getTimeOfDay(),
  personaConfig = persona,
} = {}) {
  return [
    personaConfig.corePersonality,
    '',
    '# Current Context',
    toneForTimeOfDay(timeOfDay),
    formatLocalContext(localContext),
    '',
    '# Session Mode',
    formatSessionMode(sessionMode),
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
    '- Use the current local time when greeting. Do not say good morning in the afternoon/evening.',
    '- At the start of a new voice session, use a short Mira return ritual when natural: for example, "Kelvin, I am here." Adapt it to the time, weather, and active mode. Do not repeat the ritual later in the same session.',
    '- If asked for local happenings or live news, only answer from connected local data sources; otherwise say that live local news is not connected yet.',
  ].join('\n');
}

module.exports = {
  SESSION_MODES,
  getTimeOfDay,
  formatCurrentLocalTime,
  buildRealtimeInstructions,
  formatMemories,
  formatLocalContext,
  formatSessionMode,
  formatUserProfile,
  normalizeSessionMode,
};
