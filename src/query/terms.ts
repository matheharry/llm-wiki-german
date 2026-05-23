const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "at", "for", "with", "by", "from", "about",
  "as", "into", "through", "during", "and", "or", "but", "if", "then",
  "what", "who", "which", "where", "when", "why", "how",
  "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "do", "does", "did", "have", "has", "had", "can", "could", "should", "would",
  "will", "shall", "may", "might", "must", "me", "my", "your", "his", "her",
  "its", "our", "their",
  // German
  "der", "die", "das", "ein", "eine", "ist", "sind", "war", "waren", "sein",
  "von", "zu", "in", "auf", "an", "für", "mit", "bei", "aus", "über",
  "als", "und", "oder", "aber", "wenn", "dann", "was", "wer", "welche", "wo",
  "wann", "warum", "wie", "ich", "du", "er", "sie", "es", "wir", "ihr",
  "mein", "dein", "sein", "ihr", "unser", "euer", "eure", "ihre", "seine",
]);

export function extractQueryTerms(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  
  const seen = new Set<string>();
  const out: string[] = [];
  
  for (const t of tokens) {
    // Add the original token
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    
    // 2. Basic German Stemming (lightweight)
    const stem = stemGerman(t);
    if (stem !== t && !seen.has(stem) && stem.length > 2) {
      seen.add(stem);
      out.push(stem);
    }

    // 3. Basic German Compound Splitting
    // For words > 8 chars, try to split at common boundaries
    if (t.length > 8) {
      const parts = splitGermanCompound(t);
      for (const p of parts) {
        if (p.length > 3 && !STOP_WORDS.has(p) && !seen.has(p)) {
          seen.add(p);
          out.push(p);
        }
      }
    }
  }
  return out;
}

/**
 * Very lightweight German stemmer. Removes common suffixes and normalizes umlauts.
 *
 * Handles common plural/inflection patterns:
 * - -ern, -ers, -en, -er, -es, -em, -e, -n
 * - basic umlaut normalization (ä->a, ö->o, ü->u)
 */
function stemGerman(word: string): string {
  if (word.length <= 3) return word;

  let stem = word;

  // 1. Suffix stripping (ordered from longest to shortest)
  if (stem.endsWith("ern") || stem.endsWith("ers")) {
    stem = stem.slice(0, -3);
  } else if (
    stem.endsWith("en") ||
    stem.endsWith("er") ||
    stem.endsWith("es") ||
    stem.endsWith("em")
  ) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith("e") || stem.endsWith("n")) {
    stem = stem.slice(0, -1);
  }

  // 2. Basic umlaut normalization for the stem.
  // This helps matching "Bücher" (stem: büch) with "Buch" (stem: buch)
  // or "Häuser" (stem: häus) with "Haus" (stem: haus).
  return stem
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

/**
 * Heuristic splitter for German compound words.
 */
function splitGermanCompound(word: string): string[] {
  // Simple heuristic: split if we find common "Fugen-S" or other joining patterns
  // and both parts are reasonably long.
  const parts: string[] = [];
  
  // Look for "s" joiner: Wissensbasis -> Wissen, Basis
  const sIndex = word.indexOf("s", 4);
  if (sIndex > 3 && sIndex < word.length - 4) {
    parts.push(word.slice(0, sIndex));
    parts.push(word.slice(sIndex + 1));
  }
  
  return parts;
}
