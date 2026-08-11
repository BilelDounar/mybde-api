import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

function createPrismaMock() {
  const tx = {
    user: { update: jest.fn() },
    bDE: { findUnique: jest.fn(), update: jest.fn() },
    event: { update: jest.fn() },
    ticket: { update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    order: { updateMany: jest.fn() },
  };
  return {
    tx,
    ticket: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
}

const futureEvent = { id: 'e1', bdeId: 'b1', date: new Date(Date.now() + 86400000) };
const pastEvent = { id: 'e1', bdeId: 'b1', date: new Date(Date.now() - 86400000) };

describe('TicketsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: TicketsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TicketsService(prisma as any);
  });

  describe('cancel', () => {
    it('refuse un billet introuvable', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(service.cancel('u1', 't1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse un billet non VALID (BadRequest, pas NotFound)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 't1', status: 'USED', price: 10, eventId: 'e1', event: futureEvent,
      });
      await expect(service.cancel('u1', 't1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse l\'annulation pour un événement passé', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 't1', status: 'VALID', price: 10, eventId: 'e1', event: pastEvent,
      });
      await expect(service.cancel('u1', 't1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rembourse l\'utilisateur, reprend la recette au BDE et annule la commande si plus aucun billet', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 't1', status: 'VALID', price: 10, eventId: 'e1', event: futureEvent,
      });
      prisma.tx.bDE.findUnique.mockResolvedValue({ balance: 100 });
      prisma.tx.ticket.update.mockResolvedValue({ id: 't1', status: 'CANCELLED' });
      prisma.tx.ticket.count.mockResolvedValue(0);
      await service.cancel('u1', 't1');
      expect(prisma.tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bdeCredits: { increment: 10 } },
      });
      expect(prisma.tx.bDE.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { balance: { decrement: 10 } },
      });
      expect(prisma.tx.order.updateMany).toHaveBeenCalled();
    });

    it('conserve la commande si d\'autres billets restent actifs (achat groupé)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 't1', status: 'VALID', price: 10, eventId: 'e1', event: futureEvent,
      });
      prisma.tx.bDE.findUnique.mockResolvedValue({ balance: 100 });
      prisma.tx.ticket.update.mockResolvedValue({ id: 't1', status: 'CANCELLED' });
      prisma.tx.ticket.count.mockResolvedValue(2); // 2 billets encore actifs
      await service.cancel('u1', 't1');
      expect(prisma.tx.order.updateMany).not.toHaveBeenCalled();
    });

    it('ne touche pas la trésorerie pour un billet gratuit', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 't1', status: 'VALID', price: 0, eventId: 'e1', event: futureEvent,
      });
      prisma.tx.ticket.update.mockResolvedValue({ id: 't1' });
      prisma.tx.ticket.count.mockResolvedValue(0);
      await service.cancel('u1', 't1');
      expect(prisma.tx.user.update).not.toHaveBeenCalled();
      expect(prisma.tx.bDE.update).not.toHaveBeenCalled();
    });
  });
});
