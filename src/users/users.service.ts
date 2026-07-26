import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

  /** Recherche d'utilisateurs (super admin) : nom / email, filtre par rôle. */
  search(query: { search?: string; role?: string }) {
    return this.prisma.user.findMany({
      where: {
        ...(query.role && { role: query.role as Role }),
        ...(query.search && {
          OR: [
            { displayName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Change le rôle d'un utilisateur (super admin). Impossible sur soi-même. */
  async setRole(callerId: string, id: string, role: Role) {
    if (callerId === id) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle');
    }
    await this.findOne(id);
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
    displayName: string; phone: string; bio: string; profilePicture: string;
    university: string; program: string; year: number;
    notificationsEnabled: boolean; emailNotifications: boolean;
    privacyLevel: 'PUBLIC' | 'PRIVATE';
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    language: string;
  }>) {
    await this.findOne(id);
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
