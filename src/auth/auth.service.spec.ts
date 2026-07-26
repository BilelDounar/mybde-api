import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

type AnyFn = jest.Mock;

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn() as AnyFn,
      create: jest.fn() as AnyFn,
      update: jest.fn() as AnyFn,
    },
    refreshToken: {
      create: jest.fn() as AnyFn,
      findUnique: jest.fn() as AnyFn,
      delete: jest.fn() as AnyFn,
      deleteMany: jest.fn() as AnyFn,
    },
    passwordResetToken: {
      create: jest.fn() as AnyFn,
      findUnique: jest.fn() as AnyFn,
      update: jest.fn() as AnyFn,
    },
    $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)) as AnyFn,
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    config = { get: jest.fn().mockReturnValue('development') };
    service = new AuthService(prisma as any, jwt as any, config as any);
  });

  describe('register', () => {
    it('refuse un email déjà utilisé', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.register({ email: 'a@b.fr', password: 'pw', displayName: 'A' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('crée le compte et renvoie des tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.fr', role: 'STUDENT' });
      prisma.refreshToken.create.mockResolvedValue({});

      const res = await service.register({
        email: 'a@b.fr',
        password: 'pw123456',
        displayName: 'A',
      } as any);

      expect(res.accessToken).toBe('signed.jwt.token');
      expect(typeof res.refreshToken).toBe('string');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      // Le hash stocké ne doit jamais être le token brut.
      const stored = prisma.refreshToken.create.mock.calls[0][0].data.token;
      expect(stored).not.toEqual(res.refreshToken);
    });
  });

  describe('login', () => {
    it('rejette des identifiants invalides (utilisateur inconnu)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@y.fr', password: 'pw' } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejette un mauvais mot de passe', async () => {
      const hash = await bcrypt.hash('correct', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'x@y.fr',
        role: 'STUDENT',
        passwordHash: hash,
      });
      await expect(
        service.login({ email: 'x@y.fr', password: 'wrong' } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepte un bon mot de passe', async () => {
      const hash = await bcrypt.hash('correct', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'x@y.fr',
        role: 'STUDENT',
        passwordHash: hash,
      });
      prisma.refreshToken.create.mockResolvedValue({});
      const res = await service.login({ email: 'x@y.fr', password: 'correct' } as any);
      expect(res.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('refresh', () => {
    it('rejette un token inconnu', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejette et purge un token expiré', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'u1', email: 'a@b.fr', role: 'STUDENT' },
      });
      prisma.refreshToken.delete.mockResolvedValue({});
      await expect(service.refresh('expired')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.delete).toHaveBeenCalled();
    });

    it('effectue la rotation et émet de nouveaux tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'u1', email: 'a@b.fr', role: 'STUDENT' },
      });
      prisma.refreshToken.delete.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});
      const res = await service.refresh('valid');
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt1' } });
      expect(res.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('forgotPassword', () => {
    it('réponse générique si utilisateur inconnu (anti-énumération)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await service.forgotPassword('nobody@x.fr');
      expect(res).not.toHaveProperty('devToken');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('crée un token de reset si utilisateur existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.passwordResetToken.create.mockResolvedValue({});
      const res = (await service.forgotPassword('a@b.fr')) as any;
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(res.devToken).toBeDefined();
    });
  });

  describe('resetPassword', () => {
    it('rejette un token invalide', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('bad', 'newpass')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('réinitialise et révoque les sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.refreshToken.deleteMany.mockResolvedValue({});
      const res = await service.resetPassword('good', 'newpass');
      expect(res.message).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
