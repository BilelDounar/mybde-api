import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = {
  id: true, email: true, displayName: true, profilePicture: true,
  phone: true, bio: true, role: true, bdeCredits: true,
  university: true, program: true, year: true, createdAt: true,
  notificationsEnabled: true, emailNotifications: true, privacyLevel: true,
  theme: true, language: true,
  // Adhésions BDE : utilisées pour l'affichage "Mes BDE" côté profil et pour
  // la liste admin (assignation à un BDE), donc incluses partout.
  bdeMembers: {
    select: { isAdmin: true, bde: { select: { id: true, name: true, logo: true } } },
  },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: USER_SELECT });
  }

  /**
   * Recherche d'utilisateurs paginée (super admin). La recherche est
   * multi-critères : nom, email et nom du BDE assigné. Filtre optionnel par rôle.
   */
  async search(query: { search?: string; role?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));
    const where = {
      ...(query.role && { role: query.role as Role }),
      ...(query.search && {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          {
            bdeMembers: {
              some: { bde: { name: { contains: query.search, mode: 'insensitive' as const } } },
            },
          },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /** Change le rôle d'un utilisateur (super admin). Impossible sur soi-même. */
  async setRole(callerId: string, id: string, role: Role) {
    if (callerId === id) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle');
    }
    await this.findOne(id);
    // Modèle « admin dérivé » : le statut ADMIN_BDE s'obtient en étant promu
    // admin dans un BDE. Repasser un utilisateur en ÉTUDIANT retire donc aussi
    // tous ses mandats d'admin BDE, pour rester cohérent.
    if (role === Role.STUDENT) {
      await this.prisma.bdeMember.updateMany({
        where: { userId: id, isAdmin: true },
        data: { isAdmin: false },
      });
    }
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async update(id: string, data: Partial<{
    displayName: string; email: string; phone: string; bio: string; profilePicture: string;
    university: string; program: string; year: number;
    notificationsEnabled: boolean; emailNotifications: boolean;
    privacyLevel: 'PUBLIC' | 'PRIVATE';
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    language: string;
  }>) {
    await this.findOne(id);
    // L'email est unique : on refuse explicitement un email déjà pris par un
    // autre compte (message clair plutôt qu'une erreur de contrainte Prisma).
    if (data.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Compte supprimé' };
  }

  /**
   * Crédite le solde (crédits BDE) de l'utilisateur du montant indiqué.
   * Le paiement de la recharge est simulé (mock) — on incrémente directement
   * le solde de manière atomique.
   */
  async creditBalance(id: string, amount: number) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { bdeCredits: { increment: amount } },
      select: USER_SELECT,
    });
  }

  /** Export RGPD : toutes les données personnelles de l'utilisateur. */
  async exportData(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...USER_SELECT, updatedAt: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const [memberships, tickets, orders] = await Promise.all([
      this.prisma.bdeMember.findMany({
        where: { userId: id },
        include: { bde: { select: { id: true, name: true } } },
      }),
      this.prisma.ticket.findMany({
        where: { userId: id },
        include: { event: { select: { id: true, title: true, date: true } } },
      }),
      this.prisma.order.findMany({ where: { userId: id } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user,
      memberships,
      tickets,
      orders,
    };
  }
}
