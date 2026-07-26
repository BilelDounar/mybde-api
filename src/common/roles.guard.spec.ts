import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('autorise quand aucun rôle n\'est requis', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ role: Role.STUDENT }))).toBe(true);
  });

  it('autorise quand le rôle correspond', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN_BDE, Role.SUPER_ADMIN]);
    expect(guard.canActivate(mockContext({ role: Role.ADMIN_BDE }))).toBe(true);
  });

  it('refuse quand le rôle ne correspond pas', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.SUPER_ADMIN]);
    expect(() => guard.canActivate(mockContext({ role: Role.STUDENT }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse quand il n\'y a pas d\'utilisateur', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.STUDENT]);
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
