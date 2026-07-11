const {
  inferConversationState,
  formatConversationState,
  isQuestion,
} = require('../src/services/conversationStateService');

describe('conversationStateService', () => {
  it('detects question fatigue and carries the latest user thread', () => {
    const state = inferConversationState([
      { role: 'user', content: 'Work has been strange lately.' },
      { role: 'assistant', content: 'What happened?' },
      { role: 'user', content: 'My manager keeps changing priorities.' },
      { role: 'assistant', content: 'How does that make you feel?' },
      { role: 'user', content: 'Mostly exhausted and frustrated.' },
      { role: 'assistant', content: 'What do you want to do?' },
    ]);

    expect(state.questionFatigueRisk).toBe('high');
    expect(state.emotionalDirection).toBe('tender');
    expect(state.lastUserThread).toContain('exhausted');
    expect(formatConversationState(state)).toContain('Do not ask a question');
  });

  it('respects requests for listening instead of advice', () => {
    const state = inferConversationState([
      { role: 'user', content: 'I just need to vent. Please hear me out.' },
    ]);

    expect(state.stance).toBe('listen');
    expect(formatConversationState(state)).toContain('do not advise');
  });

  it('recognizes explicit requests for help and stories', () => {
    expect(inferConversationState([{ role: 'user', content: 'Help me figure out a plan.' }]).stance).toBe('collaborate');
    expect(inferConversationState([{ role: 'user', content: 'Tell me a story to distract me.' }]).stance).toBe('story');
    expect(isQuestion('How did that go?')).toBe(true);
    expect(isQuestion('That sounds exhausting.')).toBe(false);
  });
});
