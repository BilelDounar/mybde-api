import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { NewsService } from './news.service';

const superAdmin = { id: 'admin', role: Role.SUPER_ADMIN } as any;
const student = { id: 'stu', role: Role.STUDENT } as any;

function createModelMock() {
  return {
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
}

function createPrismaMock() {
  return {
    bDE: { findUnique: jest.fn() },
    bdeMember: { findUnique: jest.fn() },
  };
}

describe('NewsService', () => {
  let model: ReturnType<typeof createModelMock>;
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: NewsService;

  beforeEach(() => {
    model = createModelMock();
    prisma = createPrismaMock();
    service = new NewsService(model as any, prisma as any);
  });

  describe('toggleLike', () => {
    it('ajoute un like quand non liké', async () => {
      const post = {
        likedByUserIds: [] as string[],
        likesCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findById.mockReturnValue({ exec: () => Promise.resolve(post) });
      const res = await service.toggleLike('u1', 'p1');
      expect(res).toEqual({ liked: true, likesCount: 1 });
      expect(post.likedByUserIds).toContain('u1');
    });

    it('retire un like quand déjà liké', async () => {
      const post = {
        likedByUserIds: ['u1'],
        likesCount: 1,
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findById.mockReturnValue({ exec: () => Promise.resolve(post) });
      const res = await service.toggleLike('u1', 'p1');
      expect(res).toEqual({ liked: false, likesCount: 0 });
    });
  });

  describe('create', () => {
    it('refuse un étudiant', async () => {
      prisma.bDE.findUnique.mockResolvedValue({ id: 'b1', slug: 's', name: 'N' });
      await expect(
        service.create(student, { bdeId: 'b1', content: 'hello' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuse si le BDE n\'existe pas', async () => {
      prisma.bDE.findUnique.mockResolvedValue(null);
      await expect(
        service.create(superAdmin, { bdeId: 'nope', content: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crée un post pour un super admin avec les métadonnées du BDE', async () => {
      prisma.bDE.findUnique.mockResolvedValue({
        id: 'b1',
        slug: 'club-tech',
        name: 'Club Tech',
      });
      model.create.mockImplementation((doc: any) => Promise.resolve({ _id: 'p1', ...doc }));
      const res: any = await service.create(superAdmin, {
        bdeId: 'b1',
        content: 'Annonce',
      } as any);
      expect(res.bdeSlug).toBe('club-tech');
      expect(res.bdeName).toBe('Club Tech');
      expect(res.content).toBe('Annonce');
    });
  });
});
