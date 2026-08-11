import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) { }

  findMyTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      include: {
        event: {
          select: {
            id: true, title: true, date: true, location: true,
            image: true, bde: { select: { name: true } },
          },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  async findOne(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId },
      include: {
        event: { select: { id: true, title: true, date: true, location: true, image: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Billet introuvable');
    return ticket;
  }

  async cancel(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId },
      include: { event: { select: { id: true, bdeId: true, date: true } } },
    });
    if (!ticket) throw new NotFoundException('Billet introuvable');
    if (ticket.status !== 'VALID') {
      throw new BadRequestException('Ce billet ne peut pas être annulé');
    }
    // On ne rembourse pas un billet pour un événement déjà passé (cohérent avec
    // « quitter un BDE », qui ne rembourse que les événements à venir). Sans ce
    // contrôle, un absent pourrait se faire rembourser après coup.
    if (ticket.event.date < new Date()) {
      throw new BadRequestException(
        "Impossible d'annuler un billet pour un événement passé",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (ticket.price > 0) {
        // Avoir rendu à l'utilisateur…
        await tx.user.update({
          where: { id: userId },
          data: { bdeCredits: { increment: ticket.price } },
        });
        // …repris sur la trésorerie du BDE organisateur (borné à 0) : la recette
        // du billet avait crédité le BDE à l'achat, on ne « crée » pas d'argent.
        const bde = await tx.bDE.findUnique({
          where: { id: ticket.event.bdeId },
          select: { balance: true },
        });
        const decrement = Math.min(ticket.price, bde?.balance ?? 0);
        if (decrement > 0) {
          await tx.bDE.update({
            where: { id: ticket.event.bdeId },
            data: { balance: { decrement } },
          });
        }
      }

      // Décrémente le compteur de participants
      await tx.event.update({
        where: { id: ticket.eventId },
        data: { currentAttendees: { decrement: 1 } },
      });

      // Marque le billet comme annulé
      const cancelled = await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'CANCELLED' },
      });

      // N'annule la/les commande(s) que si l'utilisateur n'a plus aucun billet
      // actif pour cet événement : un achat groupé partiellement annulé (par ex.
      // 1 billet sur 3) doit rester une commande valide.
      const remaining = await tx.ticket.count({
        where: {
          userId,
          eventId: ticket.eventId,
          status: { in: ['VALID', 'USED'] },
        },
      });
      if (remaining === 0) {
        await tx.order.updateMany({
          where: { userId, eventId: ticket.eventId, status: 'COMPLETED' },
          data: { status: 'CANCELLED' },
        });
      }

      return cancelled;
    });
  }
}
