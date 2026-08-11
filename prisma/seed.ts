import {
  PrismaClient,
  Role,
  BdeStatus,
  EventStatus,
  EventCategory,
  TicketStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
// Note : les actualités (NewsPost) vivent dans MongoDB — voir prisma/seed-mongo.ts.
// Les deux seeds partagent les mêmes identifiants de BDE (prisma/seed-constants.ts).
import * as bcrypt from 'bcrypt';
import { BDES, BDE_LIST, BdeKey, dateFromNow } from './seed-constants';

const prisma = new PrismaClient();

// Frais de réservation forfaitaires par commande payante (aligné sur
// EventsService.BOOKING_FEE). Sert à des Orders cohérents avec la production.
const BOOKING_FEE = 0.5;

// Avatar déterministe (même email ⇒ même visage) pour un rendu concret.
const avatar = (email: string) => `https://i.pravatar.cc/300?u=${encodeURIComponent(email)}`;
// Illustration déterministe pour les événements et actualités.
const picsum = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`;

// Normalise « Léa Martin » → « lea.martin » pour construire un email stable.
function emailOf(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '');
  return `${norm(firstName)}.${norm(lastName)}@mybde.fr`;
}

// ─── Jeu d'utilisateurs générés ──────────────────────────────
// `memberOf` = BDE rejoints ; `adminOf` = BDE administré (⇒ rôle ADMIN_BDE).
// Contrainte métier : un admin n'administre qu'un seul BDE, on ne l'inscrit
// donc que dans ce BDE (memberOf implicite = [adminOf]).
interface SeedStudent {
  firstName: string;
  lastName: string;
  program: string;
  year: number;
  university: string;
  credits?: number;
  bio?: string;
  phone?: string;
  memberOf?: BdeKey[];
  adminOf?: BdeKey;
}

const STUDENTS: SeedStudent[] = [
  // — Paris-Saclay —
  { firstName: 'Hugo', lastName: 'Bernard', program: 'Mathématiques', year: 4, university: BDES.saclay.university, adminOf: 'saclay', bio: 'Co-président du BDE, fan de rugby et de raclette.' },
  { firstName: 'Léa', lastName: 'Martin', program: 'Informatique', year: 3, university: BDES.saclay.university, memberOf: ['saclay', 'tech'], credits: 18.5, bio: 'Développeuse le jour, DJ le soir.' },
  { firstName: 'Camille', lastName: 'Dubois', program: 'Physique', year: 2, university: BDES.saclay.university, memberOf: ['saclay'], credits: 5 },
  { firstName: 'Nathan', lastName: 'Thomas', program: 'Informatique', year: 1, university: BDES.saclay.university, memberOf: ['saclay', 'tech'], credits: 12 },
  { firstName: 'Manon', lastName: 'Robert', program: 'Biologie', year: 3, university: BDES.saclay.university, memberOf: ['saclay'], credits: 30, bio: "Toujours partante pour un week-end rando." },
  { firstName: 'Lucas', lastName: 'Petit', program: 'Chimie', year: 5, university: BDES.saclay.university, memberOf: ['saclay'] },
  { firstName: 'Chloé', lastName: 'Richard', program: 'Droit', year: 2, university: BDES.saclay.university, memberOf: ['saclay'], credits: 8.5 },
  { firstName: 'Louis', lastName: 'Roux', program: 'Informatique', year: 3, university: BDES.saclay.university, memberOf: ['saclay'] },
  { firstName: 'Sarah', lastName: 'Moreau', program: 'Design', year: 1, university: BDES.saclay.university, memberOf: ['saclay', 'tech'], credits: 22, bio: 'UI/UX en herbe.' },

  // — Club Tech —
  { firstName: 'Enzo', lastName: 'Durand', program: 'Réseaux & Systèmes', year: 4, university: BDES.tech.university, adminOf: 'tech', bio: 'Homelab, Kubernetes et café.' },
  { firstName: 'Théo', lastName: 'Laurent', program: 'Cybersécurité', year: 4, university: BDES.tech.university, memberOf: ['tech'], credits: 15 },
  { firstName: 'Inès', lastName: 'Simon', program: 'Data Science', year: 5, university: BDES.tech.university, memberOf: ['tech'], credits: 40, bio: 'Machine learning & escalade.' },
  { firstName: 'Gabriel', lastName: 'Michel', program: 'Informatique', year: 2, university: BDES.tech.university, memberOf: ['tech'] },
  { firstName: 'Jade', lastName: 'Leroy', program: 'Informatique', year: 1, university: BDES.tech.university, memberOf: ['tech'], credits: 6 },

  // — Sorbonne Sciences —
  { firstName: 'Emma', lastName: 'Fontaine', program: 'Mathématiques', year: 3, university: BDES.sorbonne.university, adminOf: 'sorbonne', bio: 'Présidente du BDE Sorbonne Sciences.' },
  { firstName: 'Raphaël', lastName: 'Vincent', program: 'Physique', year: 4, university: BDES.sorbonne.university, memberOf: ['sorbonne'], credits: 11 },
  { firstName: 'Louise', lastName: 'Fournier', program: 'Chimie', year: 2, university: BDES.sorbonne.university, memberOf: ['sorbonne'], credits: 3.5 },
  { firstName: 'Adam', lastName: 'Girard', program: 'Biologie', year: 1, university: BDES.sorbonne.university, memberOf: ['sorbonne'] },
  { firstName: 'Alice', lastName: 'Bonnet', program: 'Géosciences', year: 3, university: BDES.sorbonne.university, memberOf: ['sorbonne'], credits: 19 },
  { firstName: 'Paul', lastName: 'Lambert', program: 'Mathématiques', year: 5, university: BDES.sorbonne.university, memberOf: ['sorbonne'] },
  { firstName: 'Zoé', lastName: 'Rousseau', program: 'Informatique', year: 2, university: BDES.sorbonne.university, memberOf: ['sorbonne'], credits: 9 },
  { firstName: 'Noah', lastName: 'Blanchard', program: 'Physique', year: 1, university: BDES.sorbonne.university, memberOf: ['sorbonne'], credits: 14 },
];

// ─── Jeu d'événements ────────────────────────────────────────
// `dayOffset` négatif = passé (⇒ COMPLETED), positif = à venir (⇒ PUBLISHED),
// sauf `status` explicite (ex. brouillon). `fill` = fraction des étudiants du
// BDE effectivement inscrits (les billets sont ensuite créés réellement).
interface SeedEvent {
  id: string;
  bde: BdeKey;
  title: string;
  description: string;
  dayOffset: number;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  category: EventCategory;
  tags: string[];
  tiers: { name: string; price: number }[];
  status?: EventStatus;
  fill?: number;
}

const EVENTS: SeedEvent[] = [
  // — BDE Paris-Saclay —
  {
    id: 'evt_saclay_gala', bde: 'saclay',
    title: 'Gala de rentrée', description: "La soirée d'ouverture de l'année : dîner assis, remise des prix des assos et DJ set jusqu'au bout de la nuit. Tenue de soirée exigée. 🥂",
    dayOffset: 45, startTime: '20:00', endTime: '03:00', location: 'Château de Villebon, Villebon-sur-Yvette',
    capacity: 150, category: EventCategory.SOIREE, tags: ['Gala', 'Soirée', 'Rentrée'],
    tiers: [{ name: 'Standard', price: 18 }, { name: 'VIP (dîner + boissons)', price: 35 }], fill: 0.9,
  },
  {
    id: 'evt_saclay_integ', bde: 'saclay',
    title: "Week-end d'intégration", description: "Deux jours au bord de la mer pour souder les promos : activités, grands jeux et soirée à thème. Transport et hébergement inclus. 🏖️",
    dayOffset: 20, startTime: '08:00', endTime: '18:00', location: 'Domaine de Cabourg, Normandie',
    capacity: 60, category: EventCategory.VOYAGE, tags: ['Intégration', 'Week-end'],
    tiers: [{ name: 'Pass week-end', price: 45 }], fill: 1,
  },
  {
    id: 'evt_saclay_bbq', bde: 'saclay',
    title: 'Afterwork barbecue', description: "On lance l'été avec un barbecue géant sur les pelouses du campus. Grillades offertes aux adhérents, ambiance guinguette. 🍔",
    dayOffset: 7, startTime: '18:00', endTime: '23:00', location: 'Pelouse centrale, Campus d\'Orsay',
    capacity: 80, category: EventCategory.RENCONTRE, tags: ['Afterwork', 'BBQ', 'Été'],
    tiers: [{ name: 'Gratuit adhérents', price: 0 }], fill: 0.7,
  },
  {
    id: 'evt_saclay_crepes', bde: 'saclay',
    title: 'Vente de crêpes solidaire', description: "Stand de crêpes au profit du Secours Populaire. Brouillon en préparation — bientôt publié. 🥞",
    dayOffset: 30, startTime: '11:00', endTime: '15:00', location: 'Hall du bâtiment 336',
    capacity: 200, category: EventCategory.SOLIDAIRE, tags: ['Solidaire', 'Crêpes'],
    tiers: [{ name: 'Participation libre', price: 0 }], status: EventStatus.DRAFT, fill: 0,
  },
  {
    id: 'evt_saclay_halloween', bde: 'saclay',
    title: 'Soirée Halloween', description: 'Soirée déguisée avec concours du meilleur costume et cocktails à volonté. Frissons garantis. 🎃',
    dayOffset: -40, startTime: '21:00', endTime: '04:00', location: 'Le Wagon Bar, Bures-sur-Yvette',
    capacity: 120, category: EventCategory.SOIREE, tags: ['Halloween', 'Déguisement'],
    tiers: [{ name: 'Standard', price: 8 }], fill: 0.85,
  },
  {
    id: 'evt_saclay_babyfoot', bde: 'saclay',
    title: 'Tournoi de baby-foot', description: 'Tournoi en double par élimination directe. Lots pour le podium offerts par nos partenaires. ⚽',
    dayOffset: -15, startTime: '18:00', endTime: '22:00', location: 'Foyer étudiant, Bâtiment 337',
    capacity: 32, category: EventCategory.SPORT, tags: ['Baby-foot', 'Tournoi'],
    tiers: [{ name: 'Inscription', price: 2 }], fill: 0.75,
  },

  // — Club Tech Saclay —
  {
    id: 'evt_tech_hackathon', bde: 'tech',
    title: 'Hackathon IA 48h', description: "48 heures pour prototyper une solution autour de l'IA générative. Mentors, food trucks et jury de pros. Prix : 1500 € de cash. 💻",
    dayOffset: 25, startTime: '18:00', endTime: '18:00', location: 'DigiHall, Palaiseau',
    capacity: 100, category: EventCategory.ATELIER, tags: ['Hackathon', 'IA', 'Code'],
    tiers: [{ name: 'Participant', price: 10 }], fill: 0.9,
  },
  {
    id: 'evt_tech_reactnative', bde: 'tech',
    title: 'Workshop React Native', description: "Atelier hands-on : créez votre première app mobile avec Expo et TypeScript. Apportez votre laptop. 📱",
    dayOffset: 5, startTime: '14:00', endTime: '17:30', location: 'Salle Info 304, Bâtiment 640',
    capacity: 30, category: EventCategory.ATELIER, tags: ['Dev', 'Mobile', 'React'],
    tiers: [{ name: 'Gratuit', price: 0 }], fill: 0.8,
  },
  {
    id: 'evt_tech_git', bde: 'tech',
    title: 'Atelier Git & GitHub', description: 'Maîtrisez branches, pull requests et résolution de conflits. Niveau débutant à intermédiaire. 🔧',
    dayOffset: 12, startTime: '17:00', endTime: '19:00', location: 'Salle Info 210, Bâtiment 640',
    capacity: 50, category: EventCategory.ATELIER, tags: ['Git', 'Workshop'],
    tiers: [{ name: 'Gratuit', price: 0 }], fill: 0.6,
  },
  {
    id: 'evt_tech_cyber', bde: 'tech',
    title: 'Conférence Cybersécurité', description: "Retour d'expérience d'un pentester du CERT sur les attaques récentes et comment s'en protéger. 🔐",
    dayOffset: -10, startTime: '18:00', endTime: '20:00', location: 'Amphi Blaise Pascal',
    capacity: 120, category: EventCategory.CONFERENCE, tags: ['Cybersécurité', 'Conférence'],
    tiers: [{ name: 'Gratuit', price: 0 }], fill: 0.65,
  },
  {
    id: 'evt_tech_lan', bde: 'tech',
    title: 'LAN party rétro', description: 'Nuit gaming sur consoles rétro et PC : tournois Mario Kart, Smash et Counter-Strike. 🎮',
    dayOffset: -30, startTime: '20:00', endTime: '06:00', location: 'Salle Gaming, Maison des étudiants',
    capacity: 40, category: EventCategory.AUTRE, tags: ['Gaming', 'LAN', 'E-sport'],
    tiers: [{ name: 'Place', price: 5 }], fill: 0.9,
  },

  // — BDE Sorbonne Sciences —
  {
    id: 'evt_sorb_gala', bde: 'sorbonne',
    title: 'Gala des Sciences', description: 'La grande soirée annuelle de la faculté des Sciences : cocktail, remise des diplômes de l\'année et bal. 🎓',
    dayOffset: 40, startTime: '19:30', endTime: '02:00', location: 'Sorbonne Université, Campus Pierre et Marie Curie',
    capacity: 200, category: EventCategory.SOIREE, tags: ['Gala', 'Sciences'],
    tiers: [{ name: 'Standard', price: 20 }, { name: 'Carré VIP', price: 35 }], fill: 0.85,
  },
  {
    id: 'evt_sorb_musee', bde: 'sorbonne',
    title: 'Sortie au Palais de la découverte', description: 'Visite guidée privée puis planétarium. Rendez-vous sur place, transports non inclus. 🔭',
    dayOffset: 9, startTime: '13:30', endTime: '17:00', location: 'Palais de la découverte, Paris 8e',
    capacity: 40, category: EventCategory.RENCONTRE, tags: ['Culture', 'Sortie'],
    tiers: [{ name: 'Entrée', price: 12 }], fill: 0.75,
  },
  {
    id: 'evt_sorb_climat', bde: 'sorbonne',
    title: 'Café-débat : climat & science', description: 'Discussion ouverte avec des chercheurs du GIEC autour d\'un café. Entrée libre. ☕',
    dayOffset: -20, startTime: '18:00', endTime: '20:00', location: 'Café des Sciences, Jussieu',
    capacity: 60, category: EventCategory.CONFERENCE, tags: ['Débat', 'Climat'],
    tiers: [{ name: 'Gratuit', price: 0 }], fill: 0.7,
  },
  {
    id: 'evt_sorb_cross', bde: 'sorbonne',
    title: 'Cross solidaire', description: 'Course caritative de 5 km le long de la Seine au profit de la recherche médicale. 🏃',
    dayOffset: -5, startTime: '10:00', endTime: '13:00', location: 'Quai Saint-Bernard, Paris 5e',
    capacity: 100, category: EventCategory.SPORT, tags: ['Course', 'Solidaire'],
    tiers: [{ name: 'Dossard', price: 3 }], fill: 0.6,
  },
];

async function resetDatabase() {
  // Ordre de suppression respectant les clés étrangères (enfants d'abord).
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.bdeWithdrawal.deleteMany();
  await prisma.eventTicketTier.deleteMany();
  await prisma.event.deleteMany();
  await prisma.bdeMember.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.bDE.deleteMany();
}

async function main() {
  console.log('🌱 Réinitialisation puis seed de PostgreSQL...');
  await resetDatabase();

  const adminHash = await bcrypt.hash('Admin1234!', 10);
  const studentHash = await bcrypt.hash('Test1234', 10);

  // ─── Comptes de référence (ids stables pour la démo) ───────
  const superAdmin = await prisma.user.create({
    data: {
      id: 'user_super_admin',
      email: 'admin@mybde.fr', passwordHash: adminHash,
      displayName: 'Super Admin', role: Role.SUPER_ADMIN,
      profilePicture: avatar('admin@mybde.fr'),
    },
  });

  const bilel = await prisma.user.create({
    data: {
      id: 'user_bilel',
      email: 'bilel@mybde.fr', passwordHash: studentHash,
      displayName: 'Bilel Dounar', role: Role.STUDENT,
      university: 'Université Paris-Saclay', program: 'Informatique', year: 3,
      bdeCredits: 24.5, phone: '06 12 34 56 78',
      bio: "Étudiant en 3e année, membre actif du BDE et du Club Tech.",
      profilePicture: avatar('bilel@mybde.fr'),
    },
  });

  const bdeAdmin = await prisma.user.create({
    data: {
      id: 'user_bde_admin',
      email: 'bde.admin@mybde.fr', passwordHash: adminHash,
      displayName: 'Alex Prévost', role: Role.ADMIN_BDE,
      university: BDES.saclay.university, program: 'Gestion', year: 4,
      bio: 'Trésorier du BDE Paris-Saclay.',
      profilePicture: avatar('bde.admin@mybde.fr'),
    },
  });

  // ─── Utilisateurs générés ──────────────────────────────────
  // Table de correspondance email → id (utile pour les adhésions/billets).
  const usersByEmail = new Map<string, { id: string; role: Role }>();
  usersByEmail.set(superAdmin.email, { id: superAdmin.id, role: superAdmin.role });
  usersByEmail.set(bilel.email, { id: bilel.id, role: bilel.role });
  usersByEmail.set(bdeAdmin.email, { id: bdeAdmin.id, role: bdeAdmin.role });

  for (const s of STUDENTS) {
    const email = emailOf(s.firstName, s.lastName);
    const role = s.adminOf ? Role.ADMIN_BDE : Role.STUDENT;
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: s.adminOf ? adminHash : studentHash,
        displayName: `${s.firstName} ${s.lastName}`,
        role,
        university: s.university,
        program: s.program,
        year: s.year,
        bdeCredits: s.credits ?? 0,
        bio: s.bio,
        phone: s.phone,
        profilePicture: avatar(email),
      },
    });
    usersByEmail.set(email, { id: created.id, role });
  }

  // ─── BDE ───────────────────────────────────────────────────
  for (const b of BDE_LIST) {
    await prisma.bDE.create({
      data: {
        id: b.id, name: b.name, slug: b.slug, description: b.description,
        university: b.university, status: BdeStatus.ACTIVE, joinCode: b.joinCode,
        logo: picsum(`logo-${b.slug}`),
      },
    });
  }

  // ─── Adhésions ─────────────────────────────────────────────
  // Comptes de référence : bilel dans Saclay + Tech, l'admin dans Saclay.
  const memberships: Prisma.BdeMemberCreateManyInput[] = [
    { userId: bilel.id, bdeId: BDES.saclay.id, isAdmin: false },
    { userId: bilel.id, bdeId: BDES.tech.id, isAdmin: false },
    { userId: bdeAdmin.id, bdeId: BDES.saclay.id, isAdmin: true },
  ];
  for (const s of STUDENTS) {
    const email = emailOf(s.firstName, s.lastName);
    const { id } = usersByEmail.get(email)!;
    if (s.adminOf) {
      memberships.push({ userId: id, bdeId: BDES[s.adminOf].id, isAdmin: true });
    } else {
      for (const key of s.memberOf ?? []) {
        memberships.push({ userId: id, bdeId: BDES[key].id, isAdmin: false });
      }
    }
  }
  await prisma.bdeMember.createMany({ data: memberships });

  // Étudiants « achetables » par BDE : membres non-admin dont le rôle GLOBAL est
  // STUDENT (la règle stricte interdit à un admin/super admin d'avoir un billet).
  // bilel est placé en tête pour être toujours inscrit (démo « mes billets »).
  const eligibleByBde: Record<string, string[]> = {};
  for (const b of BDE_LIST) {
    const ids = memberships
      .filter((m) => m.bdeId === b.id && !m.isAdmin)
      .map((m) => m.userId as string)
      .filter((uid) => {
        const u = [...usersByEmail.values()].find((v) => v.id === uid);
        return u?.role === Role.STUDENT;
      });
    ids.sort((a, c) => (a === bilel.id ? -1 : c === bilel.id ? 1 : 0));
    eligibleByBde[b.id] = ids;
  }

  // ─── Événements + billets + commandes ──────────────────────
  const ticketRows: Prisma.TicketCreateManyInput[] = [];
  const orderRows: Prisma.OrderCreateManyInput[] = [];
  const bdeRevenue: Record<string, number> = {};

  for (const e of EVENTS) {
    const bdeId = BDES[e.bde].id;
    const isPast = e.dayOffset < 0;
    const status = e.status ?? (isPast ? EventStatus.COMPLETED : EventStatus.PUBLISHED);
    const minPrice = Math.min(...e.tiers.map((t) => t.price));
    const standard = e.tiers[0];

    // Inscrits réels = sous-ensemble déterministe des étudiants du BDE, borné
    // par la capacité. Un brouillon (fill 0) n'a aucun inscrit.
    const eligible = eligibleByBde[bdeId] ?? [];
    const wanted = Math.round((e.fill ?? 0) * eligible.length);
    const seatCount = Math.min(wanted, e.capacity, eligible.length);
    const seated = eligible.slice(0, seatCount);

    await prisma.event.create({
      data: {
        id: e.id, bdeId, title: e.title, description: e.description,
        image: picsum(e.id),
        date: dateFromNow(e.dayOffset, Number(e.startTime.slice(0, 2))),
        startTime: e.startTime, endTime: e.endTime, location: e.location,
        capacity: e.capacity, currentAttendees: seated.length,
        status, category: e.category, tags: e.tags, price: minPrice,
        ticketTiers: { create: e.tiers.map((t, i) => ({ name: t.name, price: t.price, order: i })) },
      },
    });

    // Achat situé ~5 j avant l'événement, mais jamais dans le futur (un billet
    // d'un événement à venir a été acheté récemment, pas après coup).
    const purchasedAt = dateFromNow(Math.min(e.dayOffset - 5, -1), 12);
    seated.forEach((userId, i) => {
      // Passé : ~75 % de présents (USED), le reste absents (VALID no-show).
      const present = isPast && i % 4 !== 0;
      ticketRows.push({
        userId, eventId: e.id,
        ticketNumber: `TKT-${e.id}-${i}`,
        qrCode: `MYBDE-${e.id}-${userId}`,
        price: standard.price, ticketType: standard.name,
        status: present ? TicketStatus.USED : TicketStatus.VALID,
        purchasedAt,
      });
      if (standard.price > 0) {
        // Billet payant ⇒ commande simulée COMPLETED (prix + frais de résa).
        orderRows.push({
          userId, eventId: e.id, quantity: 1,
          totalAmount: standard.price + BOOKING_FEE,
          status: OrderStatus.COMPLETED,
          createdAt: purchasedAt,
        });
        // La recette billets (hors frais) alimente la trésorerie du BDE.
        bdeRevenue[bdeId] = (bdeRevenue[bdeId] ?? 0) + standard.price;
      }
    });
  }

  await prisma.ticket.createMany({ data: ticketRows });
  await prisma.order.createMany({ data: orderRows });

  // ─── Trésorerie des BDE + un retrait d'exemple ─────────────
  for (const [bdeId, revenue] of Object.entries(bdeRevenue)) {
    await prisma.bDE.update({ where: { id: bdeId }, data: { balance: revenue } });
  }
  // Retrait d'exemple sur le BDE Paris-Saclay (palier de 20 €, commission 5 %).
  const saclayBalance = bdeRevenue[BDES.saclay.id] ?? 0;
  if (saclayBalance >= 40) {
    await prisma.bdeWithdrawal.create({
      data: { bdeId: BDES.saclay.id, requestedById: bdeAdmin.id, amount: 40, fee: 2, netAmount: 38 },
    });
    await prisma.bDE.update({
      where: { id: BDES.saclay.id },
      data: { balance: { decrement: 40 } },
    });
  }

  // ─── Récapitulatif ─────────────────────────────────────────
  const [userCount, bdeCount, eventCount, ticketCount] = await Promise.all([
    prisma.user.count(),
    prisma.bDE.count(),
    prisma.event.count(),
    prisma.ticket.count(),
  ]);

  console.log('✅ Seed PostgreSQL terminé.');
  console.log(`   ${userCount} utilisateurs · ${bdeCount} BDE · ${eventCount} événements · ${ticketCount} billets`);
  console.log('   ℹ️  Actualités MongoDB : npm run mongo:seed');
  console.log('   ─── Comptes de connexion ───');
  console.log('   Super Admin : admin@mybde.fr        / Admin1234!');
  console.log('   Admin BDE   : bde.admin@mybde.fr    / Admin1234!  (BDE Paris-Saclay)');
  console.log('   Étudiant    : bilel@mybde.fr        / Test1234    (Saclay + Tech)');
  console.log('   Autres admins BDE (Admin1234!)  : hugo.bernard@mybde.fr, enzo.durand@mybde.fr, emma.fontaine@mybde.fr');
  console.log('   Autres étudiants (Test1234)     : lea.martin@mybde.fr, ines.simon@mybde.fr, …');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
