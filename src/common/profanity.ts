/**
 * Premier niveau de modération : détection de grossièretés dans un texte.
 *
 * L'objectif n'est pas une censure exhaustive mais un garde-fou simple côté
 * serveur : on normalise le texte (minuscules, sans accents, sans ponctuation
 * ni répétitions de lettres, avec dé-« leetspeak » basique) puis on cherche une
 * liste de termes injurieux fréquents (FR + quelques termes EN). La détection se
 * fait sur des mots entiers pour limiter les faux positifs.
 */

// Liste volontairement compacte des insultes/grossièretés les plus courantes.
const BLOCKLIST = [
  'connard', 'connasse', 'conard', 'salope', 'salaud', 'enculer', 'encule',
  'enfoire', 'pute', 'putain', 'putin', 'ptn', 'merde', 'merdique', 'bordel',
  'batard', 'batarde', 'nique', 'niquer', 'ntm', 'tafiole', 'pd', 'pede',
  'connerie', 'couille', 'bite', 'chatte', 'foutre', 'branler', 'branleur',
  'abruti', 'debile', 'cretin', 'ordure', 'raclure', 'fdp',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt',
];

/** Normalise un mot pour la comparaison (accents, leet, répétitions). */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/(.)\1+/g, '$1'); // "puuuutain" -> "putain" (lettres répétées)
}

// La blocklist est normalisée avec la même fonction que le texte analysé, afin
// que « connard » (double n) matche aussi bien la forme normalisée « conard ».
const BLOCKSET = new Set(BLOCKLIST.map(normalizeWord));

/**
 * Renvoie la liste (dédupliquée) des grossièretés détectées dans le texte.
 * Vide si le texte est acceptable. La comparaison se fait mot à mot (mots
 * entiers) pour éviter les faux positifs sur des sous-chaînes.
 */
export function detectProfanity(text: string): string[] {
  if (!text) return [];
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-zA-Z0-9@!|]+/)
    .filter(Boolean);
  const found = new Set<string>();
  for (const raw of words) {
    const word = normalizeWord(raw);
    if (BLOCKSET.has(word)) found.add(word);
  }
  return [...found];
}

/** Vrai si le texte contient au moins une grossièreté. */
export function containsProfanity(text: string): boolean {
  return detectProfanity(text).length > 0;
}
