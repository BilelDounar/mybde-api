import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mybde_content';
  await mongoose.connect(uri);
  console.log('🔌 Connecté à MongoDB :', uri);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Connexion MongoDB non initialisée');
  }

  await db.dropDatabase();
  console.log('🗑️  Base MongoDB vidée avec succès');

  await mongoose.disconnect();
}

main()
  .catch((e) => {
    console.error('Erreur lors du vidage MongoDB:', e);
    process.exit(1);
  });
