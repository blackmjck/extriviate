import { describe, test, expect } from 'vitest';
import { evaluateAnswer } from '../evaluation.service.js';

// ---------------------------------------------------------------------------
// No mocks — evaluation.service.ts is pure computation with no I/O.
// All internal helpers (normalize, levenshteinDistance, fuzzyMatch,
// tokenOverlap, tokenize) are unexported; they are exercised indirectly
// through evaluateAnswer().
// ---------------------------------------------------------------------------

/** Shared base — spread and override per assertion to reduce boilerplate. */
const base = { acceptedAnswers: [] as string[], requireQuestionFormat: false };

// ---------------------------------------------------------------------------

describe('evaluateAnswer', () => {
  // -------------------------------------------------------------------------

  describe('requireQuestionFormat gate', () => {
    test('blocks answers missing the required Jeopardy prefix; accepts all valid prefix/verb pairs; skips check when false', () => {
      const withFormat = { ...base, correctAnswer: 'France', requireQuestionFormat: true };

      // Missing prefix → immediate no_match, even though content would exactly match.
      expect(evaluateAnswer({ ...withFormat, submittedAnswer: 'France' }))
        .toEqual({ correct: false, method: 'no_match' });

      // Second word not in the allowed verb list → pattern fails.
      expect(evaluateAnswer({ ...withFormat, submittedAnswer: 'What about France?' }))
        .toEqual({ correct: false, method: 'no_match' });

      // All six pronouns and all seven verbs from QUESTION_FORMAT_PATTERN.
      const validPrefixes = [
        'What is France?', 'Who is France?', 'Where is France?',
        'When is France?', 'Why is France?', 'How is France?',
        'What are France?', 'What was France?', 'What were France?',
        'What do France?', 'What does France?', 'What did France?',
        'WHAT IS France?', // pattern is case-insensitive
      ];
      for (const submittedAnswer of validPrefixes) {
        expect(
          evaluateAnswer({ ...withFormat, submittedAnswer }).correct,
          `expected format check to pass for: ${submittedAnswer}`,
        ).toBe(true);
      }

      // requireQuestionFormat: false → no prefix needed.
      expect(evaluateAnswer({ ...base, correctAnswer: 'France', submittedAnswer: 'France' }))
        .toEqual({ correct: true, method: 'exact' });

      // normalize() strips the format prefix unconditionally (line 77 runs regardless of the flag),
      // so "What is France?" submitted with the flag off still produces an exact match.
      expect(evaluateAnswer({ ...base, correctAnswer: 'France', submittedAnswer: 'What is France?' }))
        .toEqual({ correct: true, method: 'exact' });
    });
  });

  // -------------------------------------------------------------------------

  describe('Layer 1 — exact match after normalization', () => {
    test('normalizes case, articles, punctuation, format prefix, numbers, and whitespace before exact matching', () => {
      // Helper: assert exact match for a submitted/correct pair.
      const exact = (submitted: string, correct: string) =>
        expect(evaluateAnswer({ ...base, submittedAnswer: submitted, correctAnswer: correct }))
          .toEqual({ correct: true, method: 'exact' });

      exact('FRANCE', 'france');                          // step 2: case folding
      exact('France!', 'France');                         // step 3: punctuation stripped
      exact('The United States', 'United States');        // step 4: article removed from submitted
      exact('United States', 'The United States');        // step 4: article removed from correct
      exact('What is France?', 'France');                 // step 1: format prefix stripped by normalize()
      exact('World War 2', 'world war 2');                // numbers preserved; only case differs
      exact('  france  ', 'france');                      // step 5: trim + whitespace collapse
      exact('well-known author', 'wellknown author');     // hyphen removed (non-alphanumeric char)
    });
  });

  // -------------------------------------------------------------------------

  describe('Layer 2 — accepted answers fuzzy match', () => {
    test('returns accepted_fuzzy on first matching accepted answer; iterates entire list; skips when list is empty', () => {
      // Exact match on an accepted answer (not the primary) → accepted_fuzzy.
      // The list is iterated in order: "water" is tried first —
      //   normalize("H2O")="h2o" vs normalize("water")="water": distance=5, maxLen=5, threshold=2 → fail.
      // "H2O" is tried second —
      //   "h2o" vs "h2o": distance=0 ≤ 1 → pass → accepted_fuzzy.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'H2O',
        correctAnswer: 'dihydrogen monoxide',
        acceptedAnswers: ['water', 'H2O'],
      })).toEqual({ correct: true, method: 'accepted_fuzzy' });

      // One-character typo against an accepted answer.
      // "watr" vs "water": distance=1, maxLen=5 ≤ 8, threshold=2 → pass.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'watr',
        correctAnswer: 'dihydrogen monoxide',
        acceptedAnswers: ['water'],
      })).toEqual({ correct: true, method: 'accepted_fuzzy' });

      // Empty acceptedAnswers → Layer 2 skipped → falls through to Layer 3.
      // "pariss" vs "paris": distance=1, maxLen=6 ≤ 8, threshold=2 → primary_fuzzy.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'pariss',
        correctAnswer: 'Paris',
        acceptedAnswers: [],
      })).toEqual({ correct: true, method: 'primary_fuzzy' });
    });
  });

  // -------------------------------------------------------------------------

  describe('Layer 3 — primary answer fuzzy match', () => {
    test('applies three distance tiers: ≤1 edit for maxLen≤4, ≤2 for maxLen≤8, ≤20% of length otherwise', () => {
      const fuzzy = (submitted: string, correct: string) =>
        evaluateAnswer({ ...base, submittedAnswer: submitted, correctAnswer: correct });

      // --- Tier 1: maxLen ≤ 4, threshold = 1 ---
      // "rome" vs "nome": 1 substitution (r→n). maxLen=4, distance=1 ≤ 1. PASS.
      expect(fuzzy('rome', 'nome')).toEqual({ correct: true, method: 'primary_fuzzy' });
      // "rome" vs "sore": 2 substitutions (r→s, m→r). maxLen=4, distance=2 > 1. FAIL.
      expect(fuzzy('rome', 'sore')).toEqual({ correct: false, method: 'no_match' });

      // --- Tier 2: maxLen ≤ 8, threshold = 2 ---
      // "napoleon" vs "napoln": delete 'e' and one 'o'. maxLen=8, distance=2 ≤ 2. PASS.
      expect(fuzzy('napoleon', 'napoln')).toEqual({ correct: true, method: 'primary_fuzzy' });
      // "napoleon" vs "napln": delete 'o','e','o'. maxLen=8, distance=3 > 2. FAIL.
      expect(fuzzy('napoleon', 'napln')).toEqual({ correct: false, method: 'no_match' });

      // --- Tier 3: maxLen > 8, threshold = floor(maxLen × 0.2) ---
      // "thermometer" vs "thermometur": 1 substitution (e→u at position 9).
      // maxLen=11, floor(11×0.2)=2, distance=1 ≤ 2. PASS.
      expect(fuzzy('thermometer', 'thermometur')).toEqual({ correct: true, method: 'primary_fuzzy' });
      // "thermometer" vs "thermotr": delete 'm','e','e'. maxLen=11, threshold=2, distance=3 > 2. FAIL.
      expect(fuzzy('thermometer', 'thermotr')).toEqual({ correct: false, method: 'no_match' });
    });
  });

  // -------------------------------------------------------------------------

  describe('Layer 4 — token overlap', () => {
    test('returns token_overlap when ≥80% of correct content tokens appear in submitted; short-circuits false for empty correct tokens', () => {
      // 100% of correct tokens present, but submitted has enough extra words that
      // Levenshtein distance >> threshold, so Layer 3 fails first.
      // normalize("Marie Curie") = "marie curie" → tokenize → ["marie","curie"].
      // normalize(submitted) = "it was marie curie who discovered that" (38 chars).
      // Layer 3: maxLen=38, threshold=floor(7.6)=7, distance≥27 > 7 → FAIL.
      // Layer 4: both "marie" and "curie" are in submittedTokens → 2/2 = 100% ≥ 80%.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'It was marie curie who discovered that',
        correctAnswer: 'Marie Curie',
      })).toEqual({ correct: true, method: 'token_overlap' });

      // 3/5 = 60% — below the ≥80% threshold.
      // correctTokens: ["great","barrier","reef","australia","coral"] (5 non-stop tokens).
      // submittedTokens: Set(["coral","reef","australia"]).
      // Matches: reef ✓, australia ✓, coral ✓ → 3/5 = 60% < 80%.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'coral reef australia',
        correctAnswer: 'great barrier reef australia coral',
      })).toEqual({ correct: false, method: 'no_match' });

      // All tokens in correct answer are stop words → correctTokens = [] → early return false.
      // normalize("is of the") = "is of" (article "the" stripped).
      // tokenize("is of") → "is" and "of" are both in STOP_WORDS → [].
      // Line 137: if (correctTokens.length === 0) return false.
      expect(evaluateAnswer({
        ...base,
        submittedAnswer: 'anything',
        correctAnswer: 'is of the',
      })).toEqual({ correct: false, method: 'no_match' });
    });
  });

  // -------------------------------------------------------------------------

  describe('no_match fallback', () => {
    test('returns { correct: false, method: "no_match" } when all four layers fail', () => {
      // "blurble" shares no normalized prefix, no fuzzy proximity, and no token overlap
      // with "photosynthesis" or any of the accepted answers.
      expect(evaluateAnswer({
        submittedAnswer: 'blurble',
        correctAnswer: 'photosynthesis',
        acceptedAnswers: ['chlorophyll', 'chloroplast', 'sunlight'],
        requireQuestionFormat: false,
      })).toEqual({ correct: false, method: 'no_match' });
    });
  });
});
