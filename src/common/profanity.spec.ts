import { detectProfanity, containsProfanity } from './profanity';

describe('profanity', () => {
  it('ne signale rien sur un texte propre', () => {
    expect(detectProfanity('Soirée de rentrée ce vendredi, venez nombreux !')).toEqual([]);
    expect(containsProfanity('Un super atelier cuisine 🍳')).toBe(false);
  });

  it('détecte une grossièreté simple', () => {
    expect(containsProfanity('Quel connard')).toBe(true);
  });

  it('résiste aux accents et au leetspeak', () => {
    expect(containsProfanity('enculé')).toBe(true);
    expect(containsProfanity('c0nn4rd')).toBe(true);
    expect(containsProfanity('puuuutain')).toBe(true);
  });

  it('évite les faux positifs sur des sous-chaînes', () => {
    // « scunthorpe problem » : « cunt » ne doit pas matcher dans un mot légitime.
    expect(containsProfanity('Assonance et conjecture')).toBe(false);
  });
});
