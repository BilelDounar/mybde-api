// Constantes partagées entre le seed PostgreSQL (seed.ts) et le seed MongoDB
// (seed-mongo.ts).
//
// ⚠️ Les identifiants de BDE sont FIXES et volontairement lisibles. C'est
// indispensable : les actualités vivent dans MongoDB et référencent un `bdeId`,
// tandis que les BDE vivent dans PostgreSQL. Si les BDE recevaient un id
// auto-généré (cuid), le fil d'actualités (filtré par `bdeId`) ne
// correspondrait jamais aux BDE réels et resterait donc vide. Des ids fixes
// garantissent la cohérence entre les deux bases, y compris après re-seed.

export type BdeKey = 'saclay' | 'tech' | 'sorbonne';

export interface SeedBde {
  id: string;
  name: string;
  slug: string;
  university: string;
  description: string;
  joinCode: string;
}

export const BDES: Record<BdeKey, SeedBde> = {
  saclay: {
    id: 'bde_paris_saclay',
    name: 'BDE Paris-Saclay',
    slug: 'bde-paris-saclay',
    university: 'Université Paris-Saclay',
    description:
      "Le bureau des étudiants historique du campus d'Orsay : soirées, week-ends d'intégration, entraide et bons plans toute l'année.",
    joinCode: '100001',
  },
  tech: {
    id: 'bde_club_tech',
    name: 'Club Tech Saclay',
    slug: 'club-tech-saclay',
    university: 'Université Paris-Saclay',
    description:
      'La communauté des passionné·es de code, hardware et IA : hackathons, workshops et projets étudiants encadrés.',
    joinCode: '100002',
  },
  sorbonne: {
    id: 'bde_sorbonne',
    name: 'BDE Sorbonne Sciences',
    slug: 'bde-sorbonne-sciences',
    university: 'Sorbonne Université',
    description:
      'Le BDE de la faculté des Sciences de Sorbonne Université : vie de campus, culture et solidarité étudiante.',
    joinCode: '100003',
  },
};

export const BDE_LIST: SeedBde[] = Object.values(BDES);

/**
 * Date décalée de `days` jours par rapport à maintenant, à l'heure indiquée.
 * Les dates du seed sont TOUJOURS relatives à la date d'exécution : le jeu de
 * données reste ainsi « à jour » (des événements réellement passés et d'autres
 * réellement à venir) quel que soit le jour où l'on lance le seed.
 */
export function dateFromNow(days: number, hour = 19, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
