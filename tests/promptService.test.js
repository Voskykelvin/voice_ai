const { buildRealtimeInstructions } = require('../src/services/promptService');

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
      recentTurns: [{ role: 'user', content: 'I want this to feel warm.' }],
    });

    expect(prompt).toContain('You are Mira');
    expect(prompt).toContain('Late night');
    expect(prompt).toContain('voice AI companion');
    expect(prompt).toContain('not a therapist');
    expect(prompt).toContain('self-harm');
  });
});
