export function normalizeForFuzzyMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function hasAtMostOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) {
      i += 1;
    } else {
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

export function fuzzyIncludes(haystack: string, needle: string) {
  const normalizedHaystack = normalizeForFuzzyMatch(haystack);
  const normalizedNeedle = normalizeForFuzzyMatch(needle);
  if (!normalizedNeedle) return true;
  if (normalizedHaystack.includes(normalizedNeedle)) return true;

  if (normalizedNeedle.length >= 4) {
    for (let start = 0; start < normalizedHaystack.length; start += 1) {
      const slice = normalizedHaystack.slice(start, start + normalizedNeedle.length + 1);
      if (slice && hasAtMostOneEdit(slice, normalizedNeedle)) return true;
    }
  }
  return false;
}
