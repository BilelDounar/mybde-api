import { PrismaClient, Role, BdeStatus, EventStatus, EventCategory } from '@prisma/client';
// Note : les NewsPost sont dans MongoDB — voir prisma/seed-mongo.ts
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Super Admin ───────────────────────────────────────
  const superAdminPassword = await bcrypt.hash('Admin1234!', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@mybde.fr' },
    update: { passwordHash: superAdminPassword },
    create: {
      email: 'admin@mybde.fr',
      passwordHash: superAdminPassword,
      displayName: 'Super Admin',
      role: Role.SUPER_ADMIN,
      bdeCredits: 0,
    },
  });

  // ─── Étudiant test ─────────────────────────────────────
  const studentPassword = await bcrypt.hash('Test1234', 10);
  const student = await prisma.user.upsert({
    where: { email: 'bilel@mybde.fr' },
    update: { passwordHash: studentPassword },
    create: {
      email: 'bilel@mybde.fr',
      passwordHash: studentPassword,
      displayName: 'Bilel Dounar',
      role: Role.STUDENT,
      university: 'Université Paris-Saclay',
      program: 'Informatique',
      year: 3,
      bdeCredits: 24.5,
    },
  });

  // ─── Admin BDE ─────────────────────────────────────────
  const adminBdePassword = await bcrypt.hash('Admin1234!', 10);
  const adminBde = await prisma.user.upsert({
    where: { email: 'bde.admin@mybde.fr' },
    update: { passwordHash: adminBdePassword },
    create: {
      email: 'bde.admin@mybde.fr',
      passwordHash: adminBdePassword,
      displayName: 'Admin BDE',
      role: Role.ADMIN_BDE,
    },
  });

  // ─── BDE ───────────────────────────────────────────────
  const bde = await prisma.bDE.upsert({
    where: { slug: 'bureau-des-etudiants' },
    update: {},
    create: {
      name: 'Bureau des Étudiants',
      slug: 'bureau-des-etudiants',
      description: 'Le BDE officiel de l\'université',
      university: 'Université Paris-Saclay',
      status: BdeStatus.ACTIVE,
      joinCode: '100001',
    },
  });

  const clubTech = await prisma.bDE.upsert({
    where: { slug: 'club-tech' },
    update: {},
    create: {
      name: 'Club Tech',
      slug: 'club-tech',
      description: 'Club dédié aux passionnés de technologie',
      university: 'Université Paris-Saclay',
      status: BdeStatus.ACTIVE,
      joinCode: '100002',
    },
  });

  // ─── Membres ───────────────────────────────────────────
  await prisma.bdeMember.upsert({
    where: { userId_bdeId: { userId: adminBde.id, bdeId: bde.id } },
    update: {},
    create: { userId: adminBde.id, bdeId: bde.id, isAdmin: true },
  });

  await prisma.bdeMember.upsert({
    where: { userId_bdeId: { userId: student.id, bdeId: bde.id } },
    update: {},
    create: { userId: student.id, bdeId: bde.id, isAdmin: false },
  });

  // ─── Événements ────────────────────────────────────────
  const gala = await prisma.event.upsert({
    where: { id: 'evt_seed_001' },
    update: {},
    create: {
      id: 'evt_seed_001',
      bdeId: bde.id,
      title: 'Gala d\'hiver 2024',
      description: 'Rejoignez-nous pour l\'événement le plus prestigieux de l\'année !',
      date: new Date('2024-12-15'),
      startTime: '20:00',
      endTime: '03:00',
      location: 'Grand Amphithéâtre, Campus Centre',
      capacity: 120,
      currentAttendees: 78,
      status: EventStatus.PUBLISHED,
      category: EventCategory.SOIREE,
      tags: ['Soirée Gala', 'Étudiants'],
      price: 15.0,
      ticketTiers: {
        create: [
          { name: 'Standard', price: 15.0, order: 0 },
          { name: 'VIP', price: 30.0, order: 1 },
        ],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'evt_seed_002' },
    update: {},
    create: {
      id: 'evt_seed_002',
      bdeId: clubTech.id,
      title: 'Hackathon 2024',
      description: 'Hackathon de 24h ouvert à tous les étudiants.',
      date: new Date('2024-11-20'),
      startTime: '09:00',
      endTime: '09:00',
      location: 'Labo Innovation, Bâtiment C',
      capacity: 80,
      currentAttendees: 64,
      status: EventStatus.PUBLISHED,
      category: EventCategory.ATELIER,
      tags: ['Hackathon', 'Tech'],
      price: 10.0,
      ticketTiers: {
        create: [{ name: 'Standard', price: 10.0, order: 0 }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'evt_seed_003' },
    update: {},
    create: {
      id: 'evt_seed_003',
      bdeId: bde.id,
      title: 'Soirée Jeux de Société',
      description: 'Venez passer une soirée conviviale autour de jeux de société ! 🎲',
      date: new Date('2024-11-28'),
      startTime: '18:00',
      endTime: '23:00',
      location: 'Salle des Fêtes, Bâtiment A',
      capacity: 50,
      currentAttendees: 32,
      status: EventStatus.PUBLISHED,
      category: EventCategory.SOIREE,
      tags: ['Jeux', 'Soirée'],
      price: 3.0,
      ticketTiers: {
        create: [{ name: 'Standard', price: 3.0, order: 0 }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'evt_seed_004' },
    update: {},
    create: {
      id: 'evt_seed_004',
      bdeId: clubTech.id,
      title: 'Workshop React Native',
      description: 'Apprenez à créer des apps mobiles avec React Native et Expo.',
      date: new Date('2024-12-05'),
      startTime: '14:00',
      endTime: '17:00',
      location: 'Salle Info 304, Bâtiment C',
      capacity: 30,
      currentAttendees: 28,
      status: EventStatus.PUBLISHED,
      category: EventCategory.ATELIER,
      tags: ['Dev', 'Mobile', 'React'],
      price: 0.0,
      ticketTiers: {
        create: [{ name: 'Standard', price: 0.0, order: 0 }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'evt_seed_005' },
    update: {},
    create: {
      id: 'evt_seed_005',
      bdeId: bde.id,
      title: 'Concert Live - Session Acoustique',
      description: 'Concert acoustique avec des artistes locaux. 🎸',
      date: new Date('2024-12-10'),
      startTime: '19:30',
      endTime: '22:30',
      location: 'Cour Centrale',
      capacity: 200,
      currentAttendees: 156,
      status: EventStatus.PUBLISHED,
      category: EventCategory.SOIREE,
      tags: ['Musique', 'Concert'],
      price: 5.0,
      ticketTiers: {
        create: [{ name: 'Standard', price: 5.0, order: 0 }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'evt_seed_006' },
    update: {},
    create: {
      id: 'evt_seed_006',
      bdeId: clubTech.id,
      title: 'Tournoi FIFA 2024',
      description: 'Compétition FIFA avec lots à gagner ! 🎮',
      date: new Date('2024-11-25'),
      startTime: '15:00',
      endTime: '20:00',
      location: 'Salle Gaming, Bâtiment C',
      capacity: 32,
      currentAttendees: 24,
      status: EventStatus.PUBLISHED,
      category: EventCategory.AUTRE,
      tags: ['Gaming', 'E-sport', 'FIFA'],
      price: 2.0,
      ticketTiers: {
        create: [{ name: 'Standard', price: 2.0, order: 0 }],
      },
    },
  });

  // ─── News : dans MongoDB — lancer npm run mongo:seed ──────

  console.log('✅ Seed PostgreSQL terminé !');
  console.log('   ℹ️  Pour seeder MongoDB : npm run mongo:seed');
  console.log(`   Super Admin : admin@mybde.fr / Admin1234!`);
  console.log(`   Étudiant    : bilel@mybde.fr / Test1234`);
  console.log(`   Admin BDE   : bde.admin@mybde.fr / Admin1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
