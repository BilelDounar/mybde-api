import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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
    it('filtre par rôle et recherche nom/email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.search({ search: 'bilel', role: 'STUDENT' });
      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.where.role).toBe('STUDENT');
      expect(arg.where.OR).toHaveLength(2);
    });
  });

  describe('setRole', () => {
    it('change le rôle d\'un utilisateur existant', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.ADMIN_BDE });
      const res = await service.setRole('admin1', 'u1', Role.ADMIN_BDE);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: Role.ADMIN_BDE },
        select: expect.any(Object),
      });
      expect(res.role).toBe(Role.ADMIN_BDE);
    });
  });
});
