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
  // --- Artikel & Demonstrativpronomen (Akk, Dat, Gen) ---
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einer", "einem", "einen", "eines",
  "dieser", "diese", "dieses", "diesem", "diesen", "dieser",
  "jener", "jene", "jenes", "jenem", "jenen", "jener",
  // --- Personalpronomen (Nom, Akk, Dat) ---
  "ich", "du", "er", "sie", "es", "wir", "ihr",
  "mich", "mir", "dich", "dir", "ihn", "ihm", "uns", "euch",
  // --- Reflexivpronomen (Akk, Dat) ---
  "sich",
  // --- Possessivpronomen (alle Kasus/Genus) ---
  "mein", "meine", "meiner", "meines", "meinem", "meinen",
  "dein", "deine", "deiner", "deines", "deinem", "deinen",
  "sein", "seine", "seiner", "seines", "seinem", "seinen",
  "ihr", "ihre", "ihrer", "ihres", "ihrem", "ihren",
  "unser", "unsere", "unserer", "unseres", "unserem", "unseren",
  "euer", "eure", "eurer", "eures", "eurem", "euren",
  // --- Interrogativ- & Relativpronomen ---
  "wer", "wen", "wem", "wessen", "was",
  "welcher", "welche", "welches", "welchem", "welchen",
  "wo", "wann", "warum", "wie", "woher", "wohin", "wofür", "worüber", "worin",
  // --- Hilfsverben & Modalverben (Konjugationen) ---
  "bin", "bist", "ist", "sind", "war", "waren", "warst", "sei", "seien", "seiend",
  "hat", "hast", "hatte", "hatten", "hätte", "hätten", "habe", "haben",
  "wurde", "wurden", "wirst", "werde", "werden", "worden", "wird",
  "kann", "kannst", "konnte", "konnten", "könnte", "könnten",
  "soll", "sollst", "sollte", "sollten",
  "will", "willst", "wollte", "wollten",
  "muss", "musst", "musste", "mussten", "müsse", "müssten",
  "darf", "darfst", "durfte", "durften", "dürfe", "dürften",
  "mag", "magst", "mochte", "mochten", "möchte", "möchten", "möge", "mögen",
  "lässt", "lasse", "lassen", "ließ", "ließen",
  // --- Präpositionen ---
  "von", "zu", "in", "auf", "an", "für", "mit", "bei", "aus", "über",
  "unter", "vor", "nach", "zwischen", "durch", "gegen", "ohne", "bis",
  "seit", "neben", "ab", "um",
  // --- Konjunktionen & Partikeln ---
  "als", "und", "oder", "aber", "wenn", "dann", "auch", "noch", "schon",
  "nur", "so", "da", "weil", "denn", "obwohl", "sondern", "falls",
  "dass", "ob", "damit", "deshalb", "daher", "dabei", "davon",
  "nicht", "kein", "keine", "keiner", "keines", "keinem", "keinen",
  // --- Weitere Funktionswörter ---
  "alle", "allem", "allen", "aller", "alles",
  "selbst", "man", "hier", "dort", "jetzt",
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
