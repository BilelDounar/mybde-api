# MyBDE API

Backend **NestJS + Prisma (PostgreSQL) + Mongoose (MongoDB)** pour l'application mobile MyBDE.

---

## Stack technique

| Couche | Techno |
|---|---|
| Framework | NestJS 10 (Fastify) |
| BDD relationnelle | PostgreSQL + Prisma 5 |
| BDD document | MongoDB + Mongoose 8 |
| Authentification | JWT (passport-jwt) |
| Validation | class-validator |
| Documentation | Swagger (OpenAPI) |
| Runtime | Node.js 20+ |

## Répartition des bases de données

| Données | Base | Justification |
|---|---|---|
| Users, BDE, BdeMember | **PostgreSQL** | Relations fortes, intégrité référentielle |
| Events, Ticket, Order | **PostgreSQL** | Transactions, contraintes ACID |
| NewsPost (fil d'actus) | **MongoDB** | Contenu flexible, likes embarqués |
| Messages (messagerie) | **MongoDB** | Structure variable, hauts volumes |

---

## Installation

### 1. Prérequis
- Node.js 20+
- PostgreSQL (local ou Docker)
- MongoDB (local ou Atlas)
- npm

### 2. Variables d'environnement
```bash
cp .env.example .env
# Éditer .env avec vos valeurs (DATABASE_URL, JWT_SECRET, ...)
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Générer le client Prisma et migrer la BDD
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Seeder les données de test
```bash
npm run prisma:seed   # PostgreSQL : users, BDE, events
npm run mongo:seed    # MongoDB : news posts
```
Comptes créés :
- **Super Admin** : `admin@mybde.fr` / `Admin1234!`
- **Étudiant** : `bilel@mybde.fr` / `Test1234`
- **Admin BDE** : `bde.admin@mybde.fr` / `Admin1234!`

### 6. Démarrer en développement
```bash
npm run start:dev
```

---

## Endpoints principaux

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | ❌ | Inscription |
| POST | `/auth/login` | ❌ | Connexion → JWT |
| GET | `/auth/me` | ✅ | Profil connecté |
| GET | `/users/me` | ✅ | Mon profil |
| PATCH | `/users/me` | ✅ | Modifier mon profil |
| DELETE | `/users/me` | ✅ | Supprimer mon compte (RGPD) |
| GET | `/bde` | ❌ | Liste des BDE |
| GET | `/bde/:id` | ❌ | Détail d'un BDE |
| POST | `/bde/:id/join` | ✅ | Rejoindre un BDE |
| DELETE | `/bde/:id/leave` | ✅ | Quitter un BDE |
| GET | `/events` | ❌ | Événements (`?search=&category=&bdeId=`) |
| GET | `/events/:id` | ❌ | Détail événement |
| POST | `/events/:id/register` | ✅ | S'inscrire (gratuit) |
| GET | `/tickets` | ✅ | Mes billets |
| GET | `/tickets/:id` | ✅ | Détail billet |
| DELETE | `/tickets/:id` | ✅ | Annuler un billet |
| GET | `/news` | ❌ | Fil d'actus (`?bdeId=`) |
| POST | `/news/:id/like` | ✅ | Like / Unlike |

**Documentation Swagger** : [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## Docker (optionnel — PostgreSQL local rapide)

```bash
docker run --name mybde-postgres -e POSTGRES_USER=mybde -e POSTGRES_PASSWORD=mybde -e POSTGRES_DB=mybde_db -p 5432:5432 -d postgres:16
```

`DATABASE_URL="postgresql://mybde:mybde@localhost:5432/mybde_db"`

---

## Structure du projet

```
src/
├── auth/           # JWT, login, register
│   ├── dto/
│   ├── guards/
│   └── strategies/
├── bde/            # Gestion des BDE
├── events/         # Événements
├── news/           # Fil d'actus + likes
├── prisma/         # Service Prisma global
├── tickets/        # Billets
├── users/          # Gestion profil utilisateur
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma   # Schéma BDD complet
└── seed.ts         # Données de test
```
