import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    bdeMember: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('UsersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UsersService(prisma as any);
  });

  describe('creditBalance', () => {
    it('incrémente le solde du montant indiqué', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1', bdeCredits: 35 });

      const res = await service.creditBalance('u1', 20);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bdeCredits: { increment: 20 } },
        select: expect.any(Object),
      });
      expect(res).toEqual({ id: 'u1', bdeCredits: 35 });
    });

    it('refuse si l\'utilisateur est introuvable', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.creditBalance('nope', 20)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('filtre par rôle et recherche nom/email/BDE, paginée', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      prisma.user.count.mockResolvedValue(1);
      const res = await service.search({ search: 'bilel', role: 'STUDENT' });
      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.where.role).toBe('STUDENT');
      // nom, email et nom du BDE assigné.
      expect(arg.where.OR).toHaveLength(3);
      expect(arg.take).toBe(10);
      expect(arg.skip).toBe(0);
      expect(res).toEqual({ data: [{ id: 'u1' }], total: 1, page: 1, limit: 10 });
    });
  });

  describe('setRole', () => {
    it('change le rôle d\'un utilisateur existant', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.SUPER_ADMIN });
      const res = await service.setRole('admin1', 'u1', Role.SUPER_ADMIN);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: Role.SUPER_ADMIN },
        select: expect.any(Object),
      });
      expect(res.role).toBe(Role.SUPER_ADMIN);
      expect(prisma.bdeMember.updateMany).not.toHaveBeenCalled();
    });

    it('retire les mandats d\'admin BDE en repassant en ÉTUDIANT', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.STUDENT });
      await service.setRole('admin1', 'u1', Role.STUDENT);
      expect(prisma.bdeMember.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isAdmin: true },
        data: { isAdmin: false },
      });
    });

    it('refuse de modifier son propre rôle', async () => {
      await expect(service.setRole('u1', 'u1', Role.SUPER_ADMIN)).rejects.toBeTruthy();
    });
  });
});
