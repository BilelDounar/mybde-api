import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBdeDto } from './dto/create-bde.dto';
import { UpdateBdeDto } from './dto/update-bde.dto';

// Modèle économique : commission MyBDE prélevée sur chaque retrait de trésorerie.
export const WITHDRAWAL_FEE_RATE = 0.05;
// Les retraits se font par paliers (multiples de ce montant).
export const WITHDRAWAL_STEP = 20;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Champs renvoyes par les endpoints publics (liste, detail) : on exclut le
// code d'invitation, qui ne doit etre visible que des admins du BDE concerne.
const PUBLIC_BDE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo: true,
  university: true,
  status: true,
  balance: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class BdeService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCanManage(user: User, bdeId: string) {
    if (user.role === Role.SUPER_ADMIN) return;
    const membership = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId: user.id, bdeId } },
    });
    if (!membership || !membership.isAdmin) {
      throw new ForbiddenException("Vous n'administrez pas ce BDE");
    }
  }

  /**
   * Recale le rôle global d'un utilisateur sur ses adhésions : il devient
   * ADMIN_BDE dès qu'il administre au moins un BDE, et retombe STUDENT sinon.
   * Un SUPER_ADMIN n'est jamais rétrogradé. Sans cette synchronisation, un membre
   * promu admin d'un BDE resterait bloqué par le RolesGuard (rôle global STUDENT)
   * et ne pourrait rien gérer.
   */
  private async syncManagerRole(userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target || target.role === Role.SUPER_ADMIN) return;
    const adminMemberships = await this.prisma.bdeMember.count({
      where: { userId, isAdmin: true },
    });
    const nextRole = adminMemberships > 0 ? Role.ADMIN_BDE : Role.STUDENT;
    if (target.role !== nextRole) {
      await this.prisma.user.update({ where: { id: userId }, data: { role: nextRole } });
    }
  }

  findAll() {
    return this.prisma.bDE.findMany({
      where: { status: 'ACTIVE' },
      select: { ...PUBLIC_BDE_SELECT, _count: { select: { members: true, events: true } } },
    });
  }

  /** BDE que l'utilisateur peut administrer (tous si super admin). */
  findManagedByUser(user: User) {
    if (user.role === Role.SUPER_ADMIN) {
      return this.prisma.bDE.findMany({
        include: { _count: { select: { members: true, events: true } } },
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.bDE.findMany({
      where: { members: { some: { userId: user.id, isAdmin: true } } },
      include: { _count: { select: { members: true, events: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const bde = await this.prisma.bDE.findUnique({
      where: { id },
      select: {
        ...PUBLIC_BDE_SELECT,
        _count: { select: { members: true, events: true } },
        events: { where: { status: 'PUBLISHED' }, orderBy: { date: 'asc' }, take: 5 },
      },
    });
    if (!bde) throw new NotFoundException('BDE introuvable');
    return bde;
  }

  /** Génère un code d'invitation à 6 chiffres, garanti unique en base. */
  private async generateJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await this.prisma.bDE.findUnique({
        where: { joinCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new Error('Impossible de générer un code d\'invitation unique');
  }

  async join(userId: string, bdeId: string) {
    const bde = await this.prisma.bDE.findUnique({ where: { id: bdeId } });
    if (!bde) throw new NotFoundException('BDE introuvable');

    // Seuls les utilisateurs classiques rejoignent des BDE. Un admin BDE
    // n'administre qu'un seul BDE et un super admin les gère tous : ni l'un ni
    // l'autre ne rejoint de BDE supplémentaire.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user && user.role !== Role.STUDENT) {
      throw new ForbiddenException(
        'Seuls les utilisateurs classiques peuvent rejoindre un BDE',
      );
    }

    return this.prisma.bdeMember.upsert({
      where: { userId_bdeId: { userId, bdeId } },
      update: {},
      create: { userId, bdeId },
    });
  }

  /** Rejoindre un BDE via son code d'invitation à 6 chiffres. */
  async joinByCode(userId: string, code: string) {
    const bde = await this.prisma.bDE.findUnique({ where: { joinCode: code } });
    if (!bde) throw new NotFoundException('Code d\'invitation invalide');
    return this.join(userId, bde.id);
  }

  /** Régénère le code d'invitation d'un BDE (admin du BDE ou super admin). */
  async regenerateJoinCode(user: User, bdeId: string) {
    await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);
    const joinCode = await this.generateJoinCode();
    await this.prisma.bDE.update({ where: { id: bdeId }, data: { joinCode } });
    return { joinCode };
  }

  /**
   * Quitter un BDE. Les billets valides pour des événements à venir de ce BDE
   * sont annulés et remboursés automatiquement (l'utilisateur en est informé
   * via la réponse) ; l'historique des billets passés/utilisés reste intact.
   */
  async leave(userId: string, bdeId: string) {
    const member = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId, bdeId } },
    });
    if (!member) throw new NotFoundException('Vous n\'êtes pas membre de ce BDE');
    if (member.isAdmin) throw new ForbiddenException('Un admin ne peut pas quitter le BDE sans transférer ses droits');

    const cancelledTickets = await this.prisma.$transaction(async (tx) => {
      const upcomingTickets = await tx.ticket.findMany({
        where: { userId, status: 'VALID', event: { bdeId, date: { gte: new Date() } } },
        include: { event: { select: { title: true } } },
      });

      for (const ticket of upcomingTickets) {
        if (ticket.price > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { bdeCredits: { increment: ticket.price } },
          });
          // Reprise sur la trésorerie du BDE (bornée à 0) : le remboursement
          // rend l'avoir à l'utilisateur et reprend la recette au BDE.
          const bde = await tx.bDE.findUnique({
            where: { id: bdeId },
            select: { balance: true },
          });
          const decrement = Math.min(ticket.price, bde?.balance ?? 0);
          if (decrement > 0) {
            await tx.bDE.update({
              where: { id: bdeId },
              data: { balance: { decrement } },
            });
          }
        }
        await tx.event.update({
          where: { id: ticket.eventId },
          data: { currentAttendees: { decrement: 1 } },
        });
        await tx.order.updateMany({
          where: { userId, eventId: ticket.eventId, status: 'COMPLETED' },
          data: { status: 'CANCELLED' },
        });
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELLED' } });
      }

      await tx.bdeMember.delete({ where: { userId_bdeId: { userId, bdeId } } });
      return upcomingTickets;
    });

    return {
      message: 'Vous avez quitté le BDE',
      refundedTicketsCount: cancelledTickets.length,
      refundedAmount: cancelledTickets.reduce((sum, t) => sum + t.price, 0),
      cancelledEvents: [...new Set(cancelledTickets.map((t) => t.event.title))],
    };
  }

  /** Assigne un utilisateur à un BDE (super admin) — idempotent. */
  async assignMember(bdeId: string, userId: string) {
    await this.findOne(bdeId);
    // Cohérence avec `join` : seuls les utilisateurs classiques sont membres
    // d'un BDE. Un admin BDE (dérivé d'une adhésion admin) ou un super admin ne
    // doit pas être ajouté comme simple membre. Pour rendre quelqu'un admin, on
    // l'assigne d'abord (en tant qu'étudiant) puis on le promeut (setMemberAdmin).
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    if (target.role !== Role.STUDENT) {
      throw new ForbiddenException(
        'Seuls les utilisateurs classiques peuvent être ajoutés comme membres',
      );
    }
    return this.prisma.bdeMember.upsert({
      where: { userId_bdeId: { userId, bdeId } },
      update: {},
      create: { userId, bdeId },
      include: { user: { select: { id: true, displayName: true, profilePicture: true } } },
    });
  }

  /** Membres d'un BDE — réservé à un admin de ce BDE (ou super admin). */
  async getMembers(user: User, bdeId: string) {
    await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);
    return this.prisma.bdeMember.findMany({
      where: { bdeId },
      include: {
        user: { select: { id: true, displayName: true, email: true, profilePicture: true } },
      },
      orderBy: [{ isAdmin: 'desc' }, { joinedAt: 'asc' }],
    });
  }

  /** Création d'un BDE (SUPER_ADMIN). Le créateur en devient admin. */
  async create(user: User, dto: CreateBdeDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const existing = await this.prisma.bDE.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Un BDE avec ce slug existe déjà');

    // Administrateurs désignés à la création. Le créateur est déjà membre admin
    // ci-dessous : l'exclure évite une adhésion en double.
    const adminUserIds = [...new Set(dto.adminUserIds ?? [])].filter(
      (id) => id !== user.id,
    );
    await this.assertAssignableAsAdmins(adminUserIds);

    const joinCode = await this.generateJoinCode();

    const bde = await this.prisma.bDE.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        logo: dto.logo,
        university: dto.university,
        status: dto.status ?? 'ACTIVE',
        joinCode,
        members: {
          create: [
            { userId: user.id, isAdmin: true },
            ...adminUserIds.map((userId) => ({ userId, isAdmin: true })),
          ],
        },
      },
    });

    // Aligne le rôle global des administrateurs désignés (STUDENT -> ADMIN_BDE).
    for (const userId of adminUserIds) {
      await this.syncManagerRole(userId);
    }

    return bde;
  }

  /**
   * Vérifie que chaque utilisateur peut recevoir un mandat d'administrateur :
   * il doit exister et n'administrer aucun autre BDE (même règle que
   * `setMemberAdmin`, un admin ne gère qu'un seul BDE à la fois).
   */
  private async assertAssignableAsAdmins(userIds: string[]) {
    if (userIds.length === 0) return;

    const found = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (found.length !== userIds.length) {
      throw new NotFoundException(
        'Un des utilisateurs désignés comme administrateur est introuvable',
      );
    }

    const alreadyAdmin = await this.prisma.bdeMember.findMany({
      where: { userId: { in: userIds }, isAdmin: true },
      select: { user: { select: { displayName: true } } },
    });
    if (alreadyAdmin.length > 0) {
      const names = alreadyAdmin.map((m) => m.user.displayName).join(', ');
      throw new BadRequestException(
        `${names} administre déjà un autre BDE (un admin ne peut gérer qu'un seul BDE)`,
      );
    }
  }

  async update(user: User, id: string, dto: UpdateBdeDto) {
    await this.findOne(id);
    await this.assertCanManage(user, id);
    return this.prisma.bDE.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.slug ? { slug: slugify(dto.slug) } : {}),
      },
    });
  }

  async remove(user: User, id: string) {
    await this.findOne(id);
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Seul un super admin peut supprimer un BDE');
    }
    await this.prisma.bDE.delete({ where: { id } });
    return { message: 'BDE supprimé' };
  }

  /** Promouvoir / rétrograder un membre admin (admin du BDE ou super admin). */
  async setMemberAdmin(
    user: User,
    bdeId: string,
    targetUserId: string,
    isAdmin: boolean,
  ) {
    await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);
    const membership = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId: targetUserId, bdeId } },
    });
    if (!membership) throw new NotFoundException('Membre introuvable');
    // Contrainte : un admin BDE n'administre qu'un seul BDE à la fois.
    if (isAdmin && !membership.isAdmin) {
      const otherAdminMandates = await this.prisma.bdeMember.count({
        where: { userId: targetUserId, isAdmin: true, bdeId: { not: bdeId } },
      });
      if (otherAdminMandates > 0) {
        throw new BadRequestException(
          'Cet utilisateur administre déjà un autre BDE (un admin ne peut gérer qu\'un seul BDE)',
        );
      }
    }
    const updated = await this.prisma.bdeMember.update({
      where: { userId_bdeId: { userId: targetUserId, bdeId } },
      data: { isAdmin },
      include: { user: { select: { id: true, displayName: true, email: true, profilePicture: true } } },
    });
    // Aligne le rôle global sur la nouvelle situation (promotion/rétrogradation).
    await this.syncManagerRole(targetUserId);
    return updated;
  }

  /** Retirer un membre du BDE (admin du BDE ou super admin). */
  async removeMember(user: User, bdeId: string, targetUserId: string) {
    await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);
    const membership = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId: targetUserId, bdeId } },
    });
    if (!membership) throw new NotFoundException('Membre introuvable');
    // Auto-retrait d'un admin BDE : autorisé uniquement s'il reste un autre admin
    // dans le BDE, pour ne jamais laisser le BDE sans administrateur. Un super
    // admin (qui n'administre pas via une adhésion) n'est pas concerné.
    if (targetUserId === user.id && user.role !== Role.SUPER_ADMIN) {
      const otherAdmins = await this.prisma.bdeMember.count({
        where: { bdeId, isAdmin: true, userId: { not: user.id } },
      });
      if (otherAdmins === 0) {
        throw new ForbiddenException(
          'Vous êtes le dernier administrateur de ce BDE : promouvez un autre membre avant de vous retirer',
        );
      }
    }
    await this.prisma.bdeMember.delete({
      where: { userId_bdeId: { userId: targetUserId, bdeId } },
    });
    // Le membre retiré perd peut-être son dernier mandat d'admin : recale son rôle.
    await this.syncManagerRole(targetUserId);
    return { message: 'Membre retiré' };
  }

  /**
   * Retrait de la trésorerie du BDE, par paliers de 20 €. Une commission MyBDE
   * (modèle économique) est prélevée : le BDE reçoit le montant net. Le solde du
   * BDE est débité du montant brut et le retrait est journalisé.
   */
  async withdraw(user: User, bdeId: string, amount: number) {
    const bde = await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);

    if (amount <= 0 || amount % WITHDRAWAL_STEP !== 0) {
      throw new BadRequestException(
        `Le retrait doit être un multiple de ${WITHDRAWAL_STEP} €`,
      );
    }
    if (bde.balance < amount) {
      throw new BadRequestException('Solde du BDE insuffisant');
    }

    const fee = Math.round(amount * WITHDRAWAL_FEE_RATE * 100) / 100;
    const netAmount = Math.round((amount - fee) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bDE.update({
        where: { id: bdeId },
        data: { balance: { decrement: amount } },
        select: { balance: true },
      });
      const withdrawal = await tx.bdeWithdrawal.create({
        data: { bdeId, requestedById: user.id, amount, fee, netAmount },
      });
      return {
        id: withdrawal.id,
        amount,
        fee,
        netAmount,
        feeRate: WITHDRAWAL_FEE_RATE,
        balance: updated.balance,
      };
    });
  }

  /** Historique des retraits d'un BDE (admin du BDE ou super admin). */
  async getWithdrawals(user: User, bdeId: string) {
    await this.findOne(bdeId);
    await this.assertCanManage(user, bdeId);
    return this.prisma.bdeWithdrawal.findMany({
      where: { bdeId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
