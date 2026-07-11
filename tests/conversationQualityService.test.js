const { evaluateConversation } = require('../src/services/conversationQualityService');

describe('conversationQualityService', () => {
  it('flags exhausting question-heavy conversation patterns', () => {
    const quality = evaluateConversation([
      { role: 'user', content: 'Work was difficult.' },
      { role: 'assistant', content: 'What happened?' },
      { role: 'user', content: 'My manager changed the plan.' },
      { role: 'assistant', content: 'How did that feel?' },
      { role: 'user', content: 'It was exhausting.' },
      { role: 'assistant', content: 'What will you do next?' },
    ]);
    expect(quality.assistantQuestionRate).toBe(1);
    expect(quality.findings).toContain('question_heavy');
    expect(quality.score).toBeLessThan(100);
  });

  it('keeps concise balanced conversation free of findings', () => {
    const quality = evaluateConversation([
      { role: 'user', content: 'I finally shipped it.' },
      { role: 'assistant', content: 'That sounds like relief earned the hard way.' },
      { role: 'user', content: 'It really is.' },
      { role: 'assistant', content: 'Stay with that feeling for a moment.' },
    ]);
    expect(quality.score).toBe(100);
    expect(quality.findings).toEqual([]);
  });
});
