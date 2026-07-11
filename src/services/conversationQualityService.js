function words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function opening(text) {
  return words(text).slice(0, 3).join(' ').toLowerCase().replace(/[^a-z0-9\s']/g, '');
}

function evaluateConversation(turns = []) {
  const userTurns = turns.filter((turn) => turn.role === 'user' && turn.content);
  const assistantTurns = turns.filter((turn) => turn.role === 'assistant' && turn.content);
  const questions = assistantTurns.filter((turn) => String(turn.content).includes('?')).length;
  const assistantWordCounts = assistantTurns.map((turn) => words(turn.content).length);
  const averageAssistantWords = assistantWordCounts.length
    ? assistantWordCounts.reduce((sum, count) => sum + count, 0) / assistantWordCounts.length
    : 0;
  const openings = assistantTurns.map((turn) => opening(turn.content)).filter(Boolean);
  const repeatedOpenings = openings.filter((value, index) => openings.indexOf(value) !== index).length;
  const questionRate = assistantTurns.length ? questions / assistantTurns.length : 0;
  const repeatedOpeningRate = openings.length ? repeatedOpenings / openings.length : 0;
  const balance = userTurns.length && assistantTurns.length
    ? Math.min(userTurns.length, assistantTurns.length) / Math.max(userTurns.length, assistantTurns.length)
    : 0;

  const findings = [];
  let score = 100;
  if (questionRate > 0.7 && assistantTurns.length >= 3) {
    score -= 25;
    findings.push('question_heavy');
  }
  if (averageAssistantWords > 65) {
    score -= 20;
    findings.push('responses_too_long_for_voice');
  }
  if (repeatedOpeningRate > 0.25) {
    score -= 20;
    findings.push('repeated_openings');
  }
  if (balance < 0.5 && turns.length >= 6) {
    score -= 15;
    findings.push('turn_balance_uneven');
  }

  return {
    version: 1,
    score: Math.max(0, score),
    turnCount: userTurns.length + assistantTurns.length,
    userTurns: userTurns.length,
    assistantTurns: assistantTurns.length,
    assistantQuestionRate: Number(questionRate.toFixed(3)),
    averageAssistantWords: Number(averageAssistantWords.toFixed(1)),
    repeatedOpeningRate: Number(repeatedOpeningRate.toFixed(3)),
    turnBalance: Number(balance.toFixed(3)),
    findings,
  };
}

module.exports = { evaluateConversation };
