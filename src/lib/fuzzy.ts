/**
 * Fzf-flavoured search for the exercise picker: the characters of the query have
 * to appear in order, so "bnchprs" finds "Bench Press". A plain substring hit
 * always outranks a scattered one, and earlier hits outrank later ones.
 *
 * Returns null when the query does not match, otherwise a score where bigger is
 * better.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct;

  let from = 0;
  let score = 0;
  let streak = 0;
  for (const char of q) {
    const at = t.indexOf(char, from);
    if (at < 0) return null;
    // reward characters that sit close to where the previous one was found
    streak = at === from ? streak + 1 : 0;
    score += 10 - Math.min(at - from, 9) + streak * 5;
    from = at + 1;
  }
  return score;
}
