import { describe, test, expect } from 'vitest';
import { evaluateAnswer } from '../evaluation.service.js';

// Shorthand builder so individual tests stay readable.
function evaluate(
  submittedAnswer: string,
  correctAnswer: string,
  options: { acceptedAnswers?: string[]; requireQuestionFormat?: boolean } = {},
) {
  return evaluateAnswer({
    submittedAnswer,
    correctAnswer,
    acceptedAnswers: options.acceptedAnswers ?? [],
    requireQuestionFormat: options.requireQuestionFormat ?? false,
  });
}

// ---- requireQuestionFormat ----

describe('requireQuestionFormat', () => {
  test('rejects answer missing question format prefix', () => {
    const result = evaluate('Paris', 'Paris', { requireQuestionFormat: true });
    expect(result.correct).toBe(false);
    expect(result.method).toBe('no_match');
  });

  test('accepts "What is Paris"', () => {
    const result = evaluate('What is Paris', 'Paris', { requireQuestionFormat: true });
    expect(result.correct).toBe(true);
  });

  test('accepts "Who is Marie Curie"', () => {
    const result = evaluate('Who is Marie Curie', 'Marie Curie', { requireQuestionFormat: true });
    expect(result.correct).toBe(true);
  });

  test('accepts "What are the Beatles" (plural verb)', () => {
    const result = evaluate('What are the Beatles', 'Beatles', { requireQuestionFormat: true });
    expect(result.correct).toBe(true);
  });

  test('accepts "Where is Paris" format', () => {
    const result = evaluate('Where is Paris', 'Paris', { requireQuestionFormat: true });
    expect(result.correct).toBe(true);
  });

  test('does not enforce format when flag is false', () => {
    const result = evaluate('Paris', 'Paris', { requireQuestionFormat: false });
    expect(result.correct).toBe(true);
  });
});

// ---- Layer 1: Exact match ----

describe('layer 1: exact match after normalization', () => {
  test('identical strings match', () => {
    const result = evaluate('Napoleon Bonaparte', 'Napoleon Bonaparte');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('case-insensitive match', () => {
    const result = evaluate('napoleon Bonaparte', 'Napoleon Bonaparte');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('strips leading article "the"', () => {
    const result = evaluate('the Great Wall', 'Great Wall');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('strips leading article "a"', () => {
    const result = evaluate('a Bicycle', 'Bicycle');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('strips leading article "an"', () => {
    const result = evaluate('an elephant', 'Elephant');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('strips punctuation', () => {
    const result = evaluate("Marie Curie!", 'Marie Curie');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('strips Jeopardy prefix before comparison', () => {
    // "What is" gets stripped from submitted; both normalize to same
    const result = evaluate('What is Paris', 'Paris');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('collapses extra whitespace', () => {
    const result = evaluate('New   York', 'New York');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('completely wrong answer does not match', () => {
    const result = evaluate('Tokyo', 'Paris');
    expect(result.correct).toBe(false);
  });

  test('empty submitted answer does not match non-empty correct', () => {
    const result = evaluate('', 'Paris');
    expect(result.correct).toBe(false);
  });

  test('empty submitted and empty correct both normalize to match', () => {
    // Both normalize to "" → exact match
    const result = evaluate('', '');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });
});

// ---- Layer 2: Accepted answers fuzzy ----

describe('layer 2: accepted list fuzzy match', () => {
  test('exact match in accepted list returns accepted_fuzzy', () => {
    // This will be caught by fuzzyMatch with distance=0, which passes every threshold
    const result = evaluate('NYC', 'New York City', { acceptedAnswers: ['NYC'] });
    expect(result.correct).toBe(true);
    expect(result.method).toBe('accepted_fuzzy');
  });

  test('one-edit match against accepted answer (short string)', () => {
    // "colour" vs "color" — distance 1, maxLen 6 ≤ 8 → threshold 2
    const result = evaluate('colour', 'color', { acceptedAnswers: ['color'] });
    expect(result.correct).toBe(true);
    expect(result.method).toBe('accepted_fuzzy');
  });

  test('skips layer 2 when accepted list is empty', () => {
    // Wrong answer, empty accepted list — should fall through to layer 3
    const result = evaluate('colorr', 'blue', { acceptedAnswers: [] });
    expect(result.correct).toBe(false);
  });

  test('too many edits against accepted answer fails layer 2', () => {
    // "completely wrong" vs "right" — distance way above threshold
    const result = evaluate('completely wrong', 'right', { acceptedAnswers: ['right'] });
    // Falls through to layers 3/4 which will also fail
    expect(result.correct).toBe(false);
  });
});

// ---- Layer 3: Primary answer fuzzy ----

describe('layer 3: primary answer fuzzy match', () => {
  test('one-edit typo matches (short word, ≤4 chars, threshold 1)', () => {
    // "rme" vs "rome" — normalized both; distance 1, maxLen 4 → threshold 1
    const result = evaluate('Rome', 'Rime');
    // 'rome' vs 'rime': distance 1, maxLen 4 ≤ 4 → threshold 1 → match
    expect(result.correct).toBe(true);
    expect(result.method).toBe('primary_fuzzy');
  });

  test('two-edit typo matches (medium word, ≤8 chars, threshold 2)', () => {
    // "Einsten" vs "Einstein" (missing 'i') — distance 1 actually, let's use distance 2
    // "Einstien" vs "Einstein" — transposition+extra = 2 edits, maxLen 8 ≤ 8 → threshold 2
    const result = evaluate('Einstien', 'Einstein');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('primary_fuzzy');
  });

  test('20% threshold applies for longer strings', () => {
    // "Shakespear" vs "Shakespeare" — distance 1, maxLen 11 → 20% = 2.2 → floor 2 → passes
    const result = evaluate('Shakespear', 'Shakespeare');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('primary_fuzzy');
  });

  test('answer beyond 20% threshold fails layer 3', () => {
    // "Michelangela" vs "Michelangelo" — distance 1, maxLen 12 → floor(12*0.2)=2 → passes
    // Use something clearly outside threshold instead
    // "abcdefghij" vs "zyxwvutsrq" — 10 edits, maxLen 10 → threshold 2 → fails
    const result = evaluate('abcdefghij', 'zyxwvutsrq');
    expect(result.correct).toBe(false);
  });
});

// ---- Layer 4: Token overlap ----

describe('layer 4: token overlap (≥80% of correct tokens present)', () => {
  test('all correct tokens present returns token_overlap', () => {
    // Correct: "Battle of Hastings" → tokens: ['battle', 'hastings'] (stop words removed)
    // Submitted: "the Battle of Hastings in 1066" → tokens: ['battle', 'hastings', '1066']
    const result = evaluate('The Battle of Hastings in 1066', 'Battle of Hastings');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('token_overlap');
  });

  test('80% threshold: 4/5 correct tokens present passes', () => {
    // Correct tokens: ['manhattan', 'project', 'nuclear', 'weapons', 'wwii'] (5 tokens)
    // Submitted tokens include 4 of them → 80% → passes
    const result = evaluate(
      'The Manhattan Project was about nuclear weapons',
      'The Manhattan Project nuclear weapons WWII',
    );
    expect(result.correct).toBe(true);
    expect(result.method).toBe('token_overlap');
  });

  test('below 80% threshold fails all layers', () => {
    // Correct: "Charles Darwin theory evolution natural selection" → 5 tokens
    // Submitted: only 1/5 → 20% → fails
    const result = evaluate('Darwin', 'Charles Darwin theory evolution natural selection');
    expect(result.correct).toBe(false);
    expect(result.method).toBe('no_match');
  });

  test('stop words are excluded from token comparison', () => {
    // "is the a an the" all stop words → correctTokens is empty → returns false (no tokens)
    const result = evaluate('something', 'is the a an');
    expect(result.correct).toBe(false);
  });
});

// ---- method field ----

describe('method discriminant', () => {
  test('returns exact when layer 1 matches', () => {
    expect(evaluate('Paris', 'Paris').method).toBe('exact');
  });

  test('returns accepted_fuzzy when layer 2 matches', () => {
    expect(evaluate('NY', 'New York City', { acceptedAnswers: ['NY'] }).method).toBe('accepted_fuzzy');
  });

  test('returns primary_fuzzy when layer 3 matches', () => {
    // "Rime" vs "Rome" — one character off
    expect(evaluate('Rime', 'Rome').method).toBe('primary_fuzzy');
  });

  test('returns token_overlap when layer 4 matches', () => {
    const result = evaluate('Battle of Hastings year 1066', 'Battle of Hastings');
    expect(result.method).toBe('token_overlap');
  });

  test('returns no_match when all layers fail', () => {
    expect(evaluate('completely wrong answer here', 'Paris').method).toBe('no_match');
  });
});

// ---- Edge cases ----

describe('edge cases', () => {
  test('single character correct answer — exact match', () => {
    const result = evaluate('A', 'A');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('numbers are preserved after normalization', () => {
    const result = evaluate('1969', '1969');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('hyphenated words normalized correctly', () => {
    // Hyphens are punctuation and get stripped → "well known" vs "well known"
    const result = evaluate('well-known', 'well-known');
    expect(result.correct).toBe(true);
    expect(result.method).toBe('exact');
  });

  test('submitted answer with only stop words fails all layers', () => {
    const result = evaluate('the a an', 'Paris');
    expect(result.correct).toBe(false);
  });
});
