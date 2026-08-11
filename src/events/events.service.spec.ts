import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { EventsService } from './events.service';

function createPrismaMock() {
  const tx = {
    order: { create: jest.fn() },
    ticket: { create: jest.fn(), update: jest.fn() },
    event: { update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    bDE: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    tx,
    event: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    ticket: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    bDE: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    bdeMember: { findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
}

const superAdmin = { id: 'admin', role: Role.SUPER_ADMIN } as any;
const student = { id: 'stu', role: Role.STUDENT } as any;
const bdeAdmin = { id: 'ba', role: Role.ADMIN_BDE } as any;

describe('EventsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: EventsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    const geocoding = { geocode: jest.fn().mockResolvedValue(null) };
    service = new EventsService(prisma as any, geocoding as any);
    // Acheteur valide par défaut (étudiant membre du BDE) pour register/purchase.
    prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT });
    prisma.bdeMember.findUnique.mockResolvedValue({ id: 'm1', isAdmin: false });
  });

  describe('register', () => {
    it('refuse si l\'événement est complet', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        bdeId: 'b1',
        capacity: 10,
        currentAttendees: 10,
        price: 0,
      });
      await expect(service.register('u1', 'e1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse un non-étudiant (admin) de s\'inscrire', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1', capacity: 10, currentAttendees: 0, price: 0 });
      prisma.user.findUnique.mockResolvedValue({ role: Role.ADMIN_BDE });
      await expect(service.register('a1', 'e1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuse un étudiant non membre du BDE organisateur', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1', capacity: 10, currentAttendees: 0, price: 0 });
      prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT });
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      await expect(service.register('u1', 'e1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('purchase', () => {
    it('refuse si pas assez de places', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        capacity: 10,
        currentAttendees: 9,
        price: 10,
        ticketTiers: [{ id: 'std', name: 'Standard', price: 10 }],
      });
      await expect(service.purchase('u1', 'e1', 2, 'std')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('calcule le prix VIP côté serveur et crée la commande', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        capacity: 100,
        currentAttendees: 0,
        price: 10,
        ticketTiers: [{ id: 'vip', name: 'VIP', price: 20 }],
      });
      prisma.tx.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'o1', ...data }),
      );
      prisma.tx.ticket.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 't', ...data }),
      );
      prisma.tx.event.update.mockResolvedValue({});

      const res: any = await service.purchase('u1', 'e1', 2, 'vip');
      // 10*2 (VIP) * 2 billets = 40 de billets + 0,50 € de frais de réservation.
      expect(res.order.totalAmount).toBe(40.5);
      expect(res.tickets).toHaveLength(2);
      expect(prisma.tx.event.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { currentAttendees: { increment: 2 } },
      });
      // La trésorerie du BDE est créditée du revenu billets uniquement (hors frais).
      expect(prisma.tx.bDE.update).toHaveBeenCalledWith({
        where: { id: undefined },
        data: { balance: { increment: 40 } },
      });
    });

    it('paiement par solde : refuse si solde insuffisant', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        capacity: 100,
        currentAttendees: 0,
        price: 10,
        ticketTiers: [{ id: 'std', name: 'Standard', price: 10 }],
      });
      prisma.tx.user.findUnique.mockResolvedValue({ bdeCredits: 5 });
      await expect(
        service.purchase('u1', 'e1', 1, 'std', 'balance'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tx.order.create).not.toHaveBeenCalled();
    });

    it('paiement par solde : débite les crédits et renvoie le solde', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        capacity: 100,
        currentAttendees: 0,
        price: 10,
        ticketTiers: [{ id: 'std', name: 'Standard', price: 10 }],
      });
      prisma.tx.user.findUnique
        .mockResolvedValueOnce({ bdeCredits: 50 }) // contrôle
        .mockResolvedValueOnce({ bdeCredits: 30 }); // solde final
      prisma.tx.user.update.mockResolvedValue({});
      prisma.tx.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'o1', ...data }),
      );
      prisma.tx.ticket.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 't', ...data }),
      );
      prisma.tx.event.update.mockResolvedValue({});

      const res: any = await service.purchase('u1', 'e1', 2, 'std', 'balance');
      // 10 * 2 billets = 20 + 0,50 € de frais = 20,50 € débités du solde.
      expect(prisma.tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bdeCredits: { decrement: 20.5 } },
      });
      // Le BDE ne reçoit que le revenu billets (20 €), pas les frais.
      expect(prisma.tx.bDE.update).toHaveBeenCalledWith({
        where: { id: undefined },
        data: { balance: { increment: 20 } },
      });
      expect(res.bdeCredits).toBe(30);
    });
  });

  describe('findAll (fil scopé aux BDE rejoints)', () => {
    it('un membre de plusieurs BDE voit les événements de chacun d\'eux', async () => {
      prisma.bdeMember.findMany.mockResolvedValue([{ bdeId: 'b1' }, { bdeId: 'b2' }, { bdeId: 'b3' }]);
      prisma.event.findMany.mockResolvedValue([]);
      await service.findAll({}, student);
      const arg = prisma.event.findMany.mock.calls[0][0];
      expect(arg.where.bdeId).toEqual({ in: ['b1', 'b2', 'b3'] });
    });

    it('sans adhésion : fil vide, aucune requête événements', async () => {
      prisma.bdeMember.findMany.mockResolvedValue([]);
      const res = await service.findAll({}, student);
      expect(res).toEqual([]);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('un bdeId explicite ignore le scoping (page publique d\'un BDE)', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      await service.findAll({ bdeId: 'bX' }, student);
      const arg = prisma.event.findMany.mock.calls[0][0];
      expect(arg.where.bdeId).toBe('bX');
      expect(prisma.bdeMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findForManagement', () => {
    it('super admin : pas de filtre bdeId, applique la recherche, réponse paginée', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'e1' }]);
      prisma.event.count.mockResolvedValue(1);
      const res = await service.findForManagement(superAdmin, { search: 'gala' });
      const arg = prisma.event.findMany.mock.calls[0][0];
      expect(arg.where.bdeId).toBeUndefined();
      expect(arg.where.OR).toBeDefined();
      expect(res).toEqual({ data: [{ id: 'e1' }], total: 1, page: 1, limit: 20 });
    });

    it('admin BDE : limite aux BDE administrés', async () => {
      prisma.bdeMember.findMany.mockResolvedValue([{ bdeId: 'b1' }]);
      prisma.event.findMany.mockResolvedValue([]);
      await service.findForManagement(bdeAdmin, {});
      const arg = prisma.event.findMany.mock.calls[0][0];
      expect(arg.where.bdeId).toEqual({ in: ['b1'] });
    });

    it('admin BDE sans BDE administré : réponse vide sans requête', async () => {
      prisma.bdeMember.findMany.mockResolvedValue([]);
      const res = await service.findForManagement(bdeAdmin, {});
      expect(res).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('refuse une date passée', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      await expect(
        service.create(superAdmin, {
          bdeId: 'b1',
          title: 't',
          description: 'd',
          date: '2000-01-01T00:00:00.000Z',
          startTime: '20:00',
          endTime: '23:00',
          location: 'x',
          capacity: 10,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse un admin BDE qui n\'administre pas ce BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      await expect(
        service.create(bdeAdmin, {
          bdeId: 'b1',
          title: 't',
          description: 'd',
          date: new Date(Date.now() + 86400000).toISOString(),
          startTime: '20:00',
          endTime: '23:00',
          location: 'x',
          capacity: 10,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuse un étudiant', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      await expect(
        service.create(student, {
          bdeId: 'b1',
          title: 't',
          description: 'd',
          date: new Date(Date.now() + 86400000).toISOString(),
          startTime: '20:00',
          endTime: '23:00',
          location: 'x',
          capacity: 10,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('crée l\'événement pour un super admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.event.create.mockResolvedValue({ id: 'e1' });
      const res = await service.create(superAdmin, {
        bdeId: 'b1',
        title: 't',
        description: 'd',
        date: new Date(Date.now() + 86400000).toISOString(),
        startTime: '20:00',
        endTime: '23:00',
        location: 'x',
        capacity: 10,
      } as any);
      expect(res).toEqual({ id: 'e1' });
    });

    it('refuse si le BDE n\'existe pas', async () => {
      prisma.bDE.findUnique.mockResolvedValue(null);
      await expect(
        service.create(superAdmin, { bdeId: 'nope' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('refuse une capacité inférieure aux inscrits', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        bdeId: 'b1',
        currentAttendees: 5,
      });
      await expect(
        service.update(superAdmin, 'e1', { capacity: 3 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findPublicParticipants (visibilité stricte)', () => {
    it('renvoie une liste vide pour un non-membre du BDE', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      const res = await service.findPublicParticipants(student, 'e1');
      expect(res).toEqual([]);
      expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    });

    it('renvoie les participants pour un membre du BDE', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.ticket.findMany.mockResolvedValue([{ user: { id: 'u1', displayName: 'A' } }]);
      const res = await service.findPublicParticipants(student, 'e1');
      expect(res).toEqual([{ id: 'u1', displayName: 'A' }]);
    });

    it('un super admin voit les participants sans être membre', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1' });
      prisma.ticket.findMany.mockResolvedValue([{ user: { id: 'u1' } }]);
      const res = await service.findPublicParticipants(superAdmin, 'e1');
      expect(res).toEqual([{ id: 'u1' }]);
      expect(prisma.bdeMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('removeAttendee (remboursement)', () => {
    it('rembourse l\'utilisateur et reprend la recette sur la trésorerie du BDE', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', bdeId: 'b1' });
      prisma.ticket.findFirst.mockResolvedValue({ id: 't1', userId: 'u1', price: 10, status: 'VALID' });
      prisma.tx.bDE.findUnique.mockResolvedValue({ balance: 100 });
      const res: any = await service.removeAttendee(superAdmin, 'e1', 't1');
      expect(prisma.tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bdeCredits: { increment: 10 } },
      });
      expect(prisma.tx.bDE.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { balance: { decrement: 10 } },
      });
      expect(res.refundedAmount).toBe(10);
    });
  });
});
