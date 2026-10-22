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

/**
 * Punkt 6: Komposita-Splitting.
 *
 * Die alte Fassung suchte an JEDER Position > 3 ein "s" und schnitt
 * dort ab. Aus "aggregatzustand" wurde "aggregatzu" + "tand" — zwei
 * sinnlose Fragmente, die im Ranking nichts treffen und den
 * Bigram-Bonus (6 Punkte!) auf falsche Paare legen.
 *
 * Der S-Joiner ("Wissensbasis" -> "wissen" + "basis") ist eine echte
 * deutsche Regel — aber nur, wenn das linke Teilstueck selbst ein
 * Wort ist. Ohne diese Pruefung produziert die Regel Muell.
 *
 * Deshalb: nur splitten, wenn BEIDE Teile plausibel sind:
 *  - das linke Teilstueck ist selbst ein Kompositum-Muster (Fugen-s
 *    VOR dem Suffix) ODER ein bekanntes Wort
 *  - das rechte Teilstueck ist lang genug und endet nicht auf einem
 *    Truncations-Konsonanten
 */
const KNOWN_COMPOUND_HEADS = new Set([
  "wissen", "wissens", "arbeits", "lebens", "zeit", "raum", "welt",
  "schul", "stadt", "land", "haus", "haus", "werk", "maschinen", "daten",
  "netz", "system", "software", "hardware", "prozess", "produkt", "projekt",
]);

/** Rechtschreibfehler, die der S-Joiner erzeugen kann. */
const COMPOUND_TAIL_MIN = 4;

function isPlausibleTail(part: string): boolean {
  if (part.length < COMPOUND_TAIL_MIN) return false;
  // Ein Part, der mit einem Konsonanten-Cluster endet, ist meistens
  // abgeschnitten ("tand" ist ein Fragment von "Zustand").
  return !/[bcdfghjklmnpqrstvwxz]{2}$/i.test(part);
}

function isPlausibleHead(part: string): boolean {
  if (part.length < 4) return false;
  if (KNOWN_COMPOUND_HEADS.has(part)) return true;
  // Ein Head, der selbst mit "s" endet, sieht nach einem Fugen-s aus
  // ("wissens" + "basis"). Das ist die eigentliche deutsche Regel.
  return part.endsWith("s") && part.length >= 6;
}

/**
 * Heuristischer Zerleger fuer deutsche Komposita.
 *
 * Liefert nur Teile zurueck, die plausibel sind. Im Zweifel lieber
 * nichts liefern: ein falsches Teilstueck verschmutzt das Ranking
 * (IDF-Gewichte, Bigram-Bonus) mehr als ein fehlendes.
 */
function splitGermanCompound(word: string): string[] {
  if (word.length <= 8) return [];

  const parts: string[] = [];

  // 1. Fugen-s: nur wenn links ein Wort UND rechts ein Wort steht.
  //    "wissensbasis" -> "wissen" + "basis" (der Head endet auf "s",
  //    also "wissens" ist der Fugenanteil von "Wissens" + "basis").
  for (let i = word.length - COMPOUND_TAIL_MIN; i > 3; i--) {
    if (word[i] !== "s") continue;
    const head = word.slice(0, i);
    const tail = word.slice(i + 1);
    if (!isPlausibleHead(head) || !isPlausibleTail(tail)) continue;
    // "aggregatzustand": head "aggregatzu" (kein Wort, endet nicht auf
    // "s") -> abgelehnt. "wissensbasis": head "wissens" -> akzeptiert.
    parts.push(head.replace(/s$/, ""), tail);
    return parts;
  }

  return parts;
}

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
    // Nur fuer Komposita, die sich sauber zerlegen lassen — die alte
    // Fassung produzierte aus jedem langen Wort sinnlose Fragmente.
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
  } else if (stem.endsWith("e") || stem.endsWith("n") || stem.endsWith("s")) {
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
