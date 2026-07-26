import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const NewsPostSchema = new mongoose.Schema(
  {
    bdeId: { type: String, required: true },
    bdeSlug: { type: String, required: true },
    bdeName: { type: String, required: true },
    content: { type: String, required: true },
    image: { type: String },
    likedByUserIds: { type: [String], default: [] },
    likesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const NewsPostModel = mongoose.model('NewsPost', NewsPostSchema);

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mybde_content';
  await mongoose.connect(uri);
  console.log('🌱 Seeding MongoDB...');

  await NewsPostModel.deleteMany({});

  await NewsPostModel.insertMany([
    {
      bdeId: 'bde_seed_bde',
      bdeSlug: 'bureau-des-etudiants',
      bdeName: 'Bureau des Étudiants',
      content: 'Partenariat avec Coffee Hub : -20% pour tous les membres MyBDE dès lundi ! ☕',
      likesCount: 12,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_bde',
      bdeSlug: 'bureau-des-etudiants',
      bdeName: 'Bureau des Étudiants',
      content: 'Les inscriptions pour le Gala d\'hiver sont ouvertes 🎉 Réservez vite votre place !',
      likesCount: 34,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_tech',
      bdeSlug: 'club-tech',
      bdeName: 'Club Tech',
      content: 'Le Hackathon 2024 arrive dans 2 semaines 💻 Formez vos équipes de 2 à 4 personnes.',
      likesCount: 8,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_bde',
      bdeSlug: 'bureau-des-etudiants',
      bdeName: 'Bureau des Étudiants',
      content: 'Nouveau partenariat avec la médiathèque : accès gratuit aux salles de travail en groupe 📚',
      likesCount: 45,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_tech',
      bdeSlug: 'club-tech',
      bdeName: 'Club Tech',
      content: 'Workshop React Native ce jeudi 14h ! Venez apprendre le dev mobile 📱',
      likesCount: 23,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_bde',
      bdeSlug: 'bureau-des-etudiants',
      bdeName: 'Bureau des Étudiants',
      content: 'Résultats des élections du BDE 2024-2025 ! Félicitations à toute l\'équipe 🗳️',
      likesCount: 67,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_bde',
      bdeSlug: 'bureau-des-etudiants',
      bdeName: 'Bureau des Étudiants',
      content: 'Tournoi de baby-foot ce vendredi à 18h dans la cour ! Inscription sur l\'app 🏆',
      likesCount: 19,
      likedByUserIds: [],
    },
    {
      bdeId: 'bde_seed_tech',
      bdeSlug: 'club-tech',
      bdeName: 'Club Tech',
      content: 'Recrutement pour le projet robotique 2025 ! Rejoignez-nous 🤖',
      likesCount: 31,
      likedByUserIds: [],
    },
  ]);

  console.log('✅ MongoDB seedé avec 8 news posts !');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
