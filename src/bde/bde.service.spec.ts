import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BdeService } from './bde.service';

function createPrismaMock() {
  const tx = {
    bDE: { update: jest.fn() },
    bdeWithdrawal: { create: jest.fn() },
  };
  return {
    tx,
    bDE: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    bdeMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    bdeWithdrawal: { findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
}

const superAdmin = { id: 'admin', role: Role.SUPER_ADMIN } as any;
const bdeAdmin = { id: 'ba', role: Role.ADMIN_BDE } as any;

describe('BdeService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: BdeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BdeService(prisma as any);
  });

  describe('create', () => {
    it('génère un slug et refuse les doublons', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(superAdmin, { name: 'Club Tech', university: 'U' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bDE.findUnique).toHaveBeenCalledWith({
        where: { slug: 'club-tech' },
      });
    });

    it('crée le BDE et ajoute le créateur comme admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue(null);
      prisma.bDE.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'b1', ...data }),
      );
      const res: any = await service.create(superAdmin, {
        name: 'Club Éco',
        university: 'U',
      } as any);
      expect(res.slug).toBe('club-eco');
      expect(res.members.create).toEqual({ userId: 'admin', isAdmin: true });
    });
  });

  describe('leave', () => {
    it('empêche un admin de quitter son BDE', async () => {
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      await expect(service.leave('ba', 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuse si non membre', async () => {
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      await expect(service.leave('u1', 'b1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('refuse un admin BDE (seul super admin)', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      await expect(service.remove(bdeAdmin, 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('autorise un super admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bDE.delete.mockResolvedValue({});
      const res = await service.remove(superAdmin, 'b1');
      expect(res.message).toBeDefined();
    });
  });

  describe('update', () => {
    it('refuse un admin BDE non membre admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      await expect(
        service.update(bdeAdmin, 'b1', { name: 'x' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('withdraw', () => {
    it('refuse un montant non multiple de 20', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1', balance: 100 });
      await expect(service.withdraw(superAdmin, 'b1', 30)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse si le solde du BDE est insuffisant', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1', balance: 10 });
      await expect(service.withdraw(superAdmin, 'b1', 20)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('prélève la commission (5%) et débite le solde brut', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1', balance: 100 });
      prisma.tx.bDE.update.mockResolvedValue({ balance: 60 });
      prisma.tx.bdeWithdrawal.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'w1', ...data }),
      );
      const res: any = await service.withdraw(superAdmin, 'b1', 40);
      expect(res.fee).toBe(2); // 40 * 5%
      expect(res.netAmount).toBe(38);
      expect(res.balance).toBe(60);
      expect(prisma.tx.bDE.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { balance: { decrement: 40 } },
        select: { balance: true },
      });
    });
  });

  describe('removeMember', () => {
    it('empêche de se retirer soi-même', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1', balance: 0 });
      await expect(
        service.removeMember(superAdmin, 'b1', 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
