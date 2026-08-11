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
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

  describe('join (adhésion réservée aux étudiants)', () => {
    it('autorise un étudiant', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT });
      prisma.bdeMember.upsert.mockResolvedValue({ id: 'm1' });
      const res = await service.join('u1', 'b1');
      expect(res).toEqual({ id: 'm1' });
    });

    it('refuse un admin BDE (un seul BDE autorisé)', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.ADMIN_BDE });
      await expect(service.join('ba', 'b1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bdeMember.upsert).not.toHaveBeenCalled();
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

  describe('removeMember (auto-retrait)', () => {
    it('refuse à un admin BDE de se retirer s\'il est le dernier admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      prisma.bdeMember.count.mockResolvedValue(0); // aucun autre admin
      await expect(
        service.removeMember(bdeAdmin, 'b1', 'ba'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bdeMember.delete).not.toHaveBeenCalled();
    });

    it('autorise un admin BDE à se retirer s\'il reste un autre admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      prisma.bdeMember.count.mockResolvedValue(1); // un autre admin présent
      prisma.bdeMember.delete.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ role: Role.ADMIN_BDE });
      const res = await service.removeMember(bdeAdmin, 'b1', 'ba');
      expect(prisma.bdeMember.delete).toHaveBeenCalled();
      expect(res.message).toBeDefined();
    });
  });

  describe('assignMember (réservé aux étudiants)', () => {
    it('refuse d\'ajouter un non-étudiant comme membre', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.ADMIN_BDE });
      await expect(service.assignMember('b1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.bdeMember.upsert).not.toHaveBeenCalled();
    });

    it('ajoute un étudiant', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT });
      prisma.bdeMember.upsert.mockResolvedValue({ id: 'm1' });
      const res = await service.assignMember('b1', 'u1');
      expect(res).toEqual({ id: 'm1' });
    });
  });

  describe('getMembers', () => {
    it('refuse un admin BDE qui n\'administre pas ce BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue(null);
      await expect(service.getMembers(bdeAdmin, 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('renvoie les membres pour un admin du BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      prisma.bdeMember.findMany.mockResolvedValue([{ id: 'm1' }]);
      const res = await service.getMembers(bdeAdmin, 'b1');
      expect(res).toEqual([{ id: 'm1' }]);
    });
  });

  describe('setMemberAdmin (synchronisation du rôle global)', () => {
    it('promeut un membre en ADMIN_BDE global lorsqu\'il devient admin du BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: false });
      prisma.bdeMember.update.mockResolvedValue({ id: 'm1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT });
      // 1er count = contrainte 1-BDE (aucun autre mandat), 2e count = sync (ce BDE).
      prisma.bdeMember.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      await service.setMemberAdmin(superAdmin, 'b1', 'u1', true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: Role.ADMIN_BDE },
      });
    });

    it('refuse la promotion si l\'utilisateur administre déjà un autre BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: false });
      prisma.bdeMember.count.mockResolvedValue(1); // déjà admin ailleurs
      await expect(
        service.setMemberAdmin(superAdmin, 'b1', 'u1', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bdeMember.update).not.toHaveBeenCalled();
    });

    it('rétrograde en STUDENT lorsqu\'il n\'administre plus aucun BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      prisma.bdeMember.update.mockResolvedValue({ id: 'm1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.ADMIN_BDE });
      prisma.bdeMember.count.mockResolvedValue(0);
      await service.setMemberAdmin(superAdmin, 'b1', 'u1', false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: Role.STUDENT },
      });
    });

    it('ne rétrograde jamais un super admin', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bdeMember.findUnique.mockResolvedValue({ isAdmin: true });
      prisma.bdeMember.update.mockResolvedValue({ id: 'm1' });
      prisma.user.findUnique.mockResolvedValue({ role: Role.SUPER_ADMIN });
      await service.setMemberAdmin(superAdmin, 'b1', 'u1', false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
