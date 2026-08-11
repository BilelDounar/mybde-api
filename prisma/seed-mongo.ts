import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { BDES } from './seed-constants';

dotenv.config();

// ⚠️ Le `bdeId` de chaque actualité DOIT correspondre à l'id du BDE côté
// PostgreSQL (le fil est filtré par `bdeId`). On réutilise donc les mêmes
// identifiants fixes que le seed PostgreSQL (voir prisma/seed-constants.ts).
// Sans cela, les actualités n'apparaîtraient dans le fil d'aucun utilisateur.

const NewsPostSchema = new mongoose.Schema(
  {
    bdeId: { type: String, required: true },
    bdeSlug: { type: String, required: true },
    bdeName: { type: String, required: true },
    bdeLogo: { type: String },
    content: { type: String, required: true },
    image: { type: String },
    likedByUserIds: { type: [String], default: [] },
    likesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const NewsPostModel = mongoose.model('NewsPost', NewsPostSchema);

const picsum = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`;

// Champs communs par BDE, pour éviter les répétitions. Le logo est dénormalisé
// (même valeur que le logo du BDE côté PostgreSQL) pour l'avatar du fil.
const from = (key: keyof typeof BDES) => ({
  bdeId: BDES[key].id,
  bdeSlug: BDES[key].slug,
  bdeName: BDES[key].name,
  bdeLogo: picsum(`logo-${BDES[key].slug}`),
});

// `user_bilel` : id fixe défini dans le seed PostgreSQL — permet d'afficher
// certaines publications comme déjà « aimées » par l'étudiant de démonstration.
const BILEL = 'user_bilel';

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mybde_content';
  await mongoose.connect(uri);
  console.log('🌱 Réinitialisation puis seed de MongoDB (actualités)...');

  await NewsPostModel.deleteMany({});

  await NewsPostModel.insertMany([
    // ─── BDE Paris-Saclay ───────────────────────────────────
    {
      ...from('saclay'),
      content:
        "🎟️ Les places pour le Gala de rentrée sont ouvertes ! Tarif Standard à 18 € ou VIP (dîner + boissons) à 35 €. Réservez vite, la jauge part vite.",
      image: picsum('news-gala'),
      likesCount: 42,
      likedByUserIds: [BILEL],
    },
    {
      ...from('saclay'),
      content:
        "🏖️ Week-end d'intégration à Cabourg dans 3 semaines : transport + hébergement inclus pour 45 €. Il ne reste que quelques pass, ne traînez pas !",
      likesCount: 58,
      likedByUserIds: [],
    },
    {
      ...from('saclay'),
      content:
        "🍔 Afterwork barbecue la semaine prochaine sur la pelouse centrale. Grillades offertes aux adhérents — ramenez juste votre bonne humeur.",
      image: picsum('news-bbq'),
      likesCount: 31,
      likedByUserIds: [BILEL],
    },
    {
      ...from('saclay'),
      content:
        "☕ Nouveau partenariat : -20 % chez Coffee Hub (campus d'Orsay) sur présentation de votre carte MyBDE. À consommer sans modération.",
      likesCount: 27,
      likedByUserIds: [],
    },
    {
      ...from('saclay'),
      content:
        "🏆 Merci aux 24 joueurs du tournoi de baby-foot ! Bravo à l'équipe « Les Tibias » qui repart avec les places de ciné. Photos bientôt en ligne.",
      likesCount: 19,
      likedByUserIds: [],
    },

    // ─── Club Tech Saclay ───────────────────────────────────
    {
      ...from('tech'),
      content:
        "💻 Le Hackathon IA 48h approche ! 1500 € de cash à gagner, mentors et food trucks sur place. Formez vos équipes de 2 à 4 et inscrivez-vous.",
      image: picsum('news-hackathon'),
      likesCount: 64,
      likedByUserIds: [BILEL],
    },
    {
      ...from('tech'),
      content:
        "📱 Workshop React Native jeudi 14h en salle 304 : on code une vraie app mobile avec Expo. Places limitées à 30, apportez votre laptop.",
      likesCount: 23,
      likedByUserIds: [BILEL],
    },
    {
      ...from('tech'),
      content:
        "🔧 Atelier Git & GitHub la semaine prochaine : branches, pull requests et résolution de conflits. Idéal avant vos projets de fin de semestre.",
      likesCount: 15,
      likedByUserIds: [],
    },
    {
      ...from('tech'),
      content:
        "🔐 Retour sur la conférence Cybersécurité : merci à notre intervenant du CERT pour ce panorama des attaques récentes. Slides dispo sur le Discord.",
      likesCount: 38,
      likedByUserIds: [],
    },
    {
      ...from('tech'),
      content:
        "🤖 On recrute pour le projet robotique 2026 ! Électronique, C++ ou méca : il y a une place pour toi. DM sur le Discord du club.",
      likesCount: 29,
      likedByUserIds: [],
    },

    // ─── BDE Sorbonne Sciences ──────────────────────────────
    {
      ...from('sorbonne'),
      content:
        "🎓 Le Gala des Sciences revient au Campus Pierre et Marie Curie ! Cocktail, remise des diplômes et bal. Billets Standard (20 €) et Carré VIP (35 €).",
      image: picsum('news-gala-sorbonne'),
      likesCount: 51,
      likedByUserIds: [],
    },
    {
      ...from('sorbonne'),
      content:
        "🔭 Sortie au Palais de la découverte : visite guidée privée + planétarium. 12 € l'entrée, 40 places seulement. Inscription sur l'app.",
      likesCount: 22,
      likedByUserIds: [],
    },
    {
      ...from('sorbonne'),
      content:
        "🏃 Bravo aux coureurs du Cross solidaire : 5 km le long de la Seine et 300 € reversés à la recherche médicale. Rendez-vous l'an prochain !",
      image: picsum('news-cross'),
      likesCount: 44,
      likedByUserIds: [],
    },
    {
      ...from('sorbonne'),
      content:
        "🗳️ Résultats des élections du BDE Sorbonne Sciences 2026-2027 : félicitations à la nouvelle équipe. Merci à tous les votants !",
      likesCount: 67,
      likedByUserIds: [],
    },
  ]);

  const count = await NewsPostModel.countDocuments();
  console.log(`✅ MongoDB seedé : ${count} actualités réparties sur 3 BDE.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
