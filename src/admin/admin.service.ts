import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NewsService } from '../news/news.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
  ) {}

  async summary() {
    const [usersCount, bdesCount, eventsCount, newsCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.bDE.count(),
      this.prisma.event.count(),
      this.newsService.countAll(),
    ]);
    return { usersCount, bdesCount, eventsCount, newsCount };
  }

  /**
   * Tableau de bord global du super admin : compteurs, répartition des rôles,
   * activité (événements, billets, revenu plateforme) et derniers signaux
   * (nouveaux inscrits, BDE les plus actifs). Sert d'accueil au super admin.
   */
  async dashboard() {
    const now = new Date();
    const [
      usersCount,
      bdesCount,
      activeBdesCount,
      newsCount,
      ticketsSold,
      upcomingEventsCount,
      pastEventsCount,
      roleGroups,
      revenueAgg,
      recentUsers,
      topBdesRaw,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.bDE.count(),
      this.prisma.bDE.count({ where: { status: 'ACTIVE' } }),
      this.newsService.countAll(),
      this.prisma.ticket.count({ where: { status: { in: ['VALID', 'USED'] } } }),
      this.prisma.event.count({ where: { status: 'PUBLISHED', date: { gte: now } } }),
      // Événements passés = date échue, quel que soit l'archivage (un événement
      // publié mais pas encore basculé en COMPLETED compte comme passé). On exclut
      // les brouillons et les annulés.
      this.prisma.event.count({
        where: { date: { lt: now }, status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] } },
      }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, displayName: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.bDE.findMany({
        orderBy: { members: { _count: 'desc' } },
        take: 5,
        select: {
          id: true,
          name: true,
          logo: true,
          balance: true,
          _count: { select: { members: true, events: true } },
        },
      }),
    ]);

    const usersByRole = { STUDENT: 0, ADMIN_BDE: 0, SUPER_ADMIN: 0 };
    for (const group of roleGroups) {
      usersByRole[group.role] = group._count._all;
    }

    return {
      usersCount,
      bdesCount,
      activeBdesCount,
      newsCount,
      ticketsSold,
      upcomingEventsCount,
      pastEventsCount,
      eventsCount: upcomingEventsCount + pastEventsCount,
      usersByRole,
      revenue: Math.round((revenueAgg._sum.totalAmount ?? 0) * 100) / 100,
      recentUsers,
      topBdes: topBdesRaw.map((b) => ({
        id: b.id,
        name: b.name,
        logo: b.logo,
        balance: b.balance,
        memberCount: b._count.members,
        eventCount: b._count.events,
      })),
    };
  }
}
