const CRISIS_PATTERNS = [
  /\bsuicide\b/i,
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bself[-\s]?harm\b/i,
  /\bwant to die\b/i,
  /\bcan't go on\b/i,
  /\bimmediate danger\b/i,
];

function detectCrisis(text) {
  if (!text) return false;
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

module.exports = { detectCrisis };
