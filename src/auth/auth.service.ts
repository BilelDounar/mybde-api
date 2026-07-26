import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const RESET_TTL_MS = 60 * 60 * 1000; // 1 heure

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = crypto.randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        token: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Cet email est déjà utilisé');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        university: dto.university,
        program: dto.program,
        year: dto.year,
      },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Identifiants invalides');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Rotation : on révoque l'ancien et on en émet un nouveau.
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { token: tokenHash } });
    return { message: 'Déconnecté' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Réponse identique que l'utilisateur existe ou non (anti énumération).
    const genericResponse = {
      message:
        'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.',
    };
    if (!user) return genericResponse;

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hashToken(rawToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    // En production : envoyer `rawToken` par email. En dev/académique, on le
    // renvoie pour permettre les tests (jamais hors environnement non-prod).
    if (this.config.get('NODE_ENV') !== 'production') {
      return { ...genericResponse, devToken: rawToken };
    }
    return genericResponse;
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de réinitialisation invalide ou expiré');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Révoque toutes les sessions actives après reset.
      this.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    ]);

    return { message: 'Mot de passe réinitialisé' };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        profilePicture: true,
        phone: true,
        bio: true,
        role: true,
        bdeCredits: true,
        university: true,
        program: true,
        year: true,
        notificationsEnabled: true,
        emailNotifications: true,
        privacyLevel: true,
        theme: true,
        language: true,
        createdAt: true,
      },
    });
  }
}
