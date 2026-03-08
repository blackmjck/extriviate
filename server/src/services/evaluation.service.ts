// Layered answer evaluation pipeline.
// Four layers checked in order — returns as soon as any layer matches.
// No AI evaluation yet (useAiEvaluation flag exists but is always false).

export interface EvaluationResult {
  correct: boolean;
  method: 'exact' | 'accepted_fuzzy' | 'primary_fuzzy' | 'token_overlap' | 'no_match';
}

interface EvaluationInput {
  submittedAnswer: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  requireQuestionFormat: boolean;
}

// Common English stop words removed during token comparison
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'must', 'of', 'in', 'to',
  'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'and', 'but', 'or', 'not', 'no', 'nor',
  'so', 'yet', 'both', 'either', 'neither', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
]);

// Jeopardy-style question format patterns
const QUESTION_FORMAT_PATTERN = /^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did)\s+/i;

export function evaluateAnswer(input: EvaluationInput): EvaluationResult {
  let submitted = input.submittedAnswer;

  // Check question format requirement before stripping it
  if (input.requireQuestionFormat) {
    if (!QUESTION_FORMAT_PATTERN.test(submitted)) {
      return { correct: false, method: 'no_match' };
    }
  }

  // Normalize both strings
  submitted = normalize(submitted);
  const correct = normalize(input.correctAnswer);

  // Layer 1: Exact match after normalization
  if (submitted === correct) {
    return { correct: true, method: 'exact' };
  }

  // Layer 2: Fuzzy match against accepted answers list
  for (const accepted of input.acceptedAnswers) {
    if (fuzzyMatch(submitted, normalize(accepted))) {
      return { correct: true, method: 'accepted_fuzzy' };
    }
  }

  // Layer 3: Fuzzy match against the primary correct answer
  if (fuzzyMatch(submitted, correct)) {
    return { correct: true, method: 'primary_fuzzy' };
  }

  // Layer 4: Token overlap
  if (tokenOverlap(submitted, correct)) {
    return { correct: true, method: 'token_overlap' };
  }

  return { correct: false, method: 'no_match' };
}

// ---- Normalization ----

function normalize(text: string): string {
  let result = text;

  // Strip Jeopardy question format prefix
  result = result.replace(QUESTION_FORMAT_PATTERN, '');

  // Lowercase
  result = result.toLowerCase();

  // Remove punctuation (keep letters, numbers, spaces)
  result = result.replace(/[^a-z0-9\s]/g, '');

  // Remove articles
  result = result.replace(/\b(a|an|the)\b/g, '');

  // Collapse whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// ---- Levenshtein Distance ----

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use a single-row DP approach for memory efficiency
  const row = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j] + 1,       // deletion
        row[j - 1] + 1,   // insertion
        prev + cost,       // substitution
      );
      prev = row[j];
      row[j] = val;
    }
  }

  return row[n];
}

// ---- Fuzzy Match ----

function fuzzyMatch(submitted: string, correct: string): boolean {
  const distance = levenshteinDistance(submitted, correct);
  const maxLen = Math.max(submitted.length, correct.length);

  // Threshold: 1 edit for ≤4 chars, 2 edits for ≤8 chars, 20% of length otherwise
  if (maxLen <= 4) return distance <= 1;
  if (maxLen <= 8) return distance <= 2;
  return distance <= Math.floor(maxLen * 0.2);
}

// ---- Token Overlap ----

function tokenOverlap(submitted: string, correct: string): boolean {
  const correctTokens = tokenize(correct);
  if (correctTokens.length === 0) return false;

  const submittedTokens = new Set(tokenize(submitted));
  let matches = 0;

  for (const token of correctTokens) {
    if (submittedTokens.has(token)) matches++;
  }

  // Require ≥80% of correct tokens to appear in submitted answer
  return matches / correctTokens.length >= 0.8;
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}
