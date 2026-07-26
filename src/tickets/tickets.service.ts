import { Injectable, NotFoundException } from '@nestjs/common';
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
    const ticket = await this.findOne(userId, ticketId);
    if (ticket.status !== 'VALID') {
      throw new NotFoundException('Ce billet ne peut pas être annulé');
    }

    return this.prisma.$transaction(async (tx) => {
      // Rembourse les crédits utilisateur si le billet était payant
      if (ticket.price > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { bdeCredits: { increment: ticket.price } },
        });
      }

      // Décrémente le compteur de participants
      await tx.event.update({
        where: { id: ticket.eventId },
        data: { currentAttendees: { decrement: 1 } },
      });

      // Annule la commande liée s'il en existe une
      await tx.order.updateMany({
        where: { userId, eventId: ticket.eventId, status: 'COMPLETED' },
        data: { status: 'CANCELLED' },
      });

      // Marque le billet comme annulé
      return tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'CANCELLED' },
      });
    });
  }
}
