const { buildRealtimeInstructions, getTimeOfDay } = require('../src/services/promptService');

describe('promptService', () => {
  it('includes persona, time context, memories, and safety boundaries', () => {
    const prompt = buildRealtimeInstructions({
      timeOfDay: 'late_night',
      memories: [{
        category: 'goal',
        content: 'The user is building a voice AI companion.',
        importance: 5,
        isSensitive: false,
      }],
      userProfile: { displayName: 'Kelvin', timezone: 'Africa/Nairobi', location: 'Nairobi, Kenya' },
      localContext: {
        currentLocalTime: 'Tuesday, July 7, 2026 at 2:15 PM GMT+3 (Africa/Nairobi)',
        weather: {
          location: 'Nairobi, Kenya',
          summary: 'partly cloudy, 24C',
          source: 'Open-Meteo',
        },
      },
      recentTurns: [{ role: 'user', content: 'I want this to feel warm.' }],
    });

    expect(prompt).toContain('You are Mira');
    expect(prompt).toContain('Late night');
    expect(prompt).toContain('voice AI companion');
    expect(prompt).toContain('Preferred name: Kelvin');
    expect(prompt).toContain('Africa/Nairobi');
    expect(prompt).toContain('2:15 PM');
    expect(prompt).toContain('partly cloudy');
    expect(prompt).toContain('not a therapist');
    expect(prompt).toContain('self-harm');
  });

  it('uses the user timezone when choosing the time of day', () => {
    const date = new Date('2026-07-07T11:00:00.000Z');
    expect(getTimeOfDay(date, 'Africa/Nairobi')).toBe('afternoon');
    expect(getTimeOfDay(date, 'America/New_York')).toBe('morning');
  });
});
