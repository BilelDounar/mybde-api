import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { GeocodingService } from './geocoding.service';

const TICKET_TIERS_INCLUDE = { ticketTiers: { orderBy: { order: 'asc' as const } } };

@Injectable()
export class EventsService {
  /** Frais de réservation forfaitaires par commande payante (revenu plateforme). */
  static readonly BOOKING_FEE = 0.5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) { }

  /** Identifiants des BDE que l'utilisateur peut administrer (tous si super admin). */
  private async managedBdeIds(user: User): Promise<string[] | 'ALL'> {
    if (user.role === Role.SUPER_ADMIN) return 'ALL';
    const memberships = await this.prisma.bdeMember.findMany({
      where: { userId: user.id, isAdmin: true },
      select: { bdeId: true },
    });
    return memberships.map((m) => m.bdeId);
  }

  /**
   * Liste des événements pour la vue gestion (tous statuts, dont brouillons).
   * - SUPER_ADMIN : vue globale de tous les événements (recherche/filtre).
   * - ADMIN_BDE : uniquement les événements des BDE qu'il administre.
   */
  async findForManagement(
    user: User,
    query: { search?: string; status?: string; category?: string; bdeId?: string; page?: number; limit?: number },
  ) {
    const managed = await this.managedBdeIds(user);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    if (managed !== 'ALL' && managed.length === 0) {
      return { data: [], total: 0, page, limit };
    }
    // Un `bdeId` explicite scope la liste à ce seul BDE (vue « détail BDE » du
    // super admin) — refusé s'il sort du périmètre d'un admin BDE.
    if (query.bdeId && managed !== 'ALL' && !managed.includes(query.bdeId)) {
      return { data: [], total: 0, page, limit };
    }
    const bdeFilter = query.bdeId
      ? query.bdeId
      : managed !== 'ALL'
        ? { in: managed }
        : undefined;
    const where = {
      ...(bdeFilter !== undefined && { bdeId: bdeFilter }),
      ...(query.status && { status: query.status as any }),
      ...(query.category && { category: query.category as any }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { location: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { bde: { select: { id: true, name: true, logo: true } }, ...TICKET_TIERS_INCLUDE },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /**
   * Règle stricte d'inscription : seul un étudiant **membre du BDE organisateur**
   * peut s'inscrire / acheter un billet. Cela garantit qu'un compte présent sur
   * la plateforme mais non rattaché au BDE n'apparaît jamais parmi ses inscrits,
   * et qu'un administrateur (qui reçoit les fonds et est présent d'office) ne
   * peut pas acheter de billet.
   */
  private async assertCanRegister(userId: string, bdeId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== Role.STUDENT) {
      throw new ForbiddenException(
        "Seuls les étudiants peuvent s'inscrire aux événements",
      );
    }
    const membership = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId, bdeId } },
    });
    if (!membership) {
      throw new ForbiddenException(
        'Vous devez être membre du BDE organisateur pour vous inscrire',
      );
    }
  }

  /** Vérifie que l'utilisateur peut administrer le BDE donné. */
  private async assertCanManageBde(user: User, bdeId: string) {
    if (user.role === Role.SUPER_ADMIN) return;
    if (user.role !== Role.ADMIN_BDE) {
      throw new ForbiddenException('Droits insuffisants pour cette action');
    }
    const membership = await this.prisma.bdeMember.findUnique({
      where: { userId_bdeId: { userId: user.id, bdeId } },
    });
    if (!membership || !membership.isAdmin) {
      throw new ForbiddenException("Vous n'administrez pas ce BDE");
    }
  }

  /**
   * Liste des événements publiés. Sans `bdeId` explicite et pour un appelant
   * connu, le flux est scopé aux BDE que l'utilisateur a rejoints (un BDE
   * correspond à un abonnement à son contenu) — sans adhésion, liste vide.
   * Un `bdeId` explicite (ex. page publique d'un BDE) ignore ce scoping.
   */
  async findAll(query: { category?: string; bdeId?: string; search?: string }, user?: User | null) {
    // Bascule d'abord les événements publiés déjà passés en COMPLETED, pour ne
    // jamais les servir comme « à venir » dans le fil (le filtre PUBLISHED
    // ci-dessous les exclut alors naturellement).
    await this.archivePastEvents();
    let memberBdeIds: string[] | undefined;
    if (!query.bdeId && user) {
      const memberships = await this.prisma.bdeMember.findMany({
        where: { userId: user.id },
        select: { bdeId: true },
      });
      memberBdeIds = memberships.map((m) => m.bdeId);
      if (memberBdeIds.length === 0) return [];
    }

    return this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.category && { category: query.category as any }),
        ...(query.bdeId
          ? { bdeId: query.bdeId }
          : memberBdeIds
            ? { bdeId: { in: memberBdeIds } }
            : {}),
        ...(query.search && {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { location: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { bde: { select: { id: true, name: true, logo: true } }, ...TICKET_TIERS_INCLUDE },
      orderBy: { date: 'asc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { bde: { select: { id: true, name: true, logo: true } }, ...TICKET_TIERS_INCLUDE },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    return event;
  }

  async register(userId: string, eventId: string) {
    const event = await this.findOne(eventId);
    await this.assertCanRegister(userId, event.bdeId);
    if (event.currentAttendees >= event.capacity) {
      throw new BadRequestException('Événement complet');
    }
    const [ticket] = await this.prisma.$transaction([
      this.prisma.ticket.create({
        data: {
          userId,
          eventId,
          ticketNumber: `TKT-${Date.now()}`,
          qrCode: `MYBDE-${eventId}-${userId}-${Date.now()}`,
          price: event.price,
        },
      }),
      this.prisma.event.update({
        where: { id: eventId },
        data: { currentAttendees: { increment: 1 } },
      }),
    ]);
    return ticket;
  }

  /**
   * Achat de billet(s) payant(s). Le paiement est simulé (mock) : l'Order est
   * marqué COMPLETED. Le prix est recalculé côté serveur à partir du tarif
   * choisi (jamais fait confiance au client). Capacité contrôlée en transaction.
   */
  async purchase(
    userId: string,
    eventId: string,
    quantity: number,
    tierId: string,
    paymentMethod: 'card' | 'balance' = 'card',
  ) {
    const event = await this.findOne(eventId);
    await this.assertCanRegister(userId, event.bdeId);
    if (event.currentAttendees + quantity > event.capacity) {
      throw new BadRequestException('Places insuffisantes pour cet événement');
    }

    const tier = event.ticketTiers.find((t) => t.id === tierId);
    if (!tier) throw new NotFoundException('Tarif introuvable pour cet événement');
    const ticketType = tier.name;

    const unitPrice = Number(tier.price);
    // Revenu billets (revient à la trésorerie du BDE organisateur).
    const ticketRevenue = unitPrice * quantity;
    // Frais de réservation de la plateforme MyBDE (forfait par commande, non
    // reversé au BDE). Couvre les frais de transaction et de service.
    const bookingFee = ticketRevenue > 0 ? EventsService.BOOKING_FEE : 0;
    // Montant réellement débité à l'acheteur = ce qui est affiché au paiement.
    const totalAmount = ticketRevenue + bookingFee;

    return this.prisma.$transaction(async (tx) => {
      // Paiement par solde : on débite les crédits BDE (contrôle atomique).
      if (paymentMethod === 'balance' && totalAmount > 0) {
        const buyer = await tx.user.findUnique({
          where: { id: userId },
          select: { bdeCredits: true },
        });
        if (!buyer || buyer.bdeCredits < totalAmount) {
          throw new BadRequestException('Solde insuffisant');
        }
        await tx.user.update({
          where: { id: userId },
          data: { bdeCredits: { decrement: totalAmount } },
        });
      }

      const order = await tx.order.create({
        data: {
          userId,
          eventId,
          totalAmount,
          quantity,
          status: 'COMPLETED',
        },
      });

      const tickets = await Promise.all(
        Array.from({ length: quantity }).map((_, i) =>
          tx.ticket.create({
            data: {
              userId,
              eventId,
              ticketNumber: `TKT-${Date.now()}-${i}`,
              qrCode: `MYBDE-${eventId}-${userId}-${Date.now()}-${i}`,
              price: unitPrice,
              ticketType,
            },
          }),
        ),
      );

      await tx.event.update({
        where: { id: eventId },
        data: { currentAttendees: { increment: quantity } },
      });

      // Les ventes créditent la trésorerie du BDE organisateur (hors frais de
      // réservation, qui restent à la plateforme MyBDE).
      if (ticketRevenue > 0) {
        await tx.bDE.update({
          where: { id: event.bdeId },
          data: { balance: { increment: ticketRevenue } },
        });
      }

      const buyer = await tx.user.findUnique({
        where: { id: userId },
        select: { bdeCredits: true },
      });

      return { order, tickets, bdeCredits: buyer?.bdeCredits ?? 0 };
    });
  }

  /** Prix minimum parmi une liste de tarifs (affichage liste sans jointure). */
  private minTierPrice(tiers: { price: number }[]): number {
    if (tiers.length === 0) return 0;
    return Math.min(...tiers.map((t) => Number(t.price)));
  }

  async create(user: User, dto: CreateEventDto) {
    const bde = await this.prisma.bDE.findUnique({ where: { id: dto.bdeId } });
    if (!bde) throw new NotFoundException('BDE introuvable');
    await this.assertCanManageBde(user, dto.bdeId);

    if (new Date(dto.date).getTime() < Date.now()) {
      throw new BadRequestException('La date de l\'événement doit être future');
    }

    const tiers = dto.ticketTiers?.length ? dto.ticketTiers : [{ name: 'Standard', price: 0 }];
    const geo = await this.geocoding.geocode(dto.location);

    return this.prisma.event.create({
      data: {
        bdeId: dto.bdeId,
        title: dto.title,
        description: dto.description,
        image: dto.image,
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        location: dto.location,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        capacity: dto.capacity,
        category: dto.category ?? 'AUTRE',
        status: dto.status ?? 'PUBLISHED',
        tags: dto.tags ?? [],
        price: this.minTierPrice(tiers),
        ticketTiers: {
          create: tiers.map((t, i) => ({ name: t.name, price: t.price, order: i })),
        },
      },
      include: TICKET_TIERS_INCLUDE,
    });
  }

  async update(user: User, id: string, dto: UpdateEventDto) {
    const event = await this.findOne(id);
    await this.assertCanManageBde(user, event.bdeId);

    if (dto.date && new Date(dto.date).getTime() < Date.now()) {
      throw new BadRequestException('La date de l\'événement doit être future');
    }
    if (dto.capacity != null && dto.capacity < event.currentAttendees) {
      throw new BadRequestException(
        'La capacité ne peut pas être inférieure au nombre d\'inscrits',
      );
    }

    const { ticketTiers, ...rest } = dto;
    const geo =
      dto.location && dto.location !== event.location
        ? await this.geocoding.geocode(dto.location)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (ticketTiers?.length) {
        await tx.eventTicketTier.deleteMany({ where: { eventId: id } });
      }
      return tx.event.update({
        where: { id },
        data: {
          ...rest,
          ...(dto.date ? { date: new Date(dto.date) } : {}),
          ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
          ...(ticketTiers?.length
            ? {
                price: this.minTierPrice(ticketTiers),
                ticketTiers: { create: ticketTiers.map((t, i) => ({ name: t.name, price: t.price, order: i })) },
              }
            : {}),
        },
        include: TICKET_TIERS_INCLUDE,
      });
    });
  }

  async remove(user: User, id: string) {
    const event = await this.findOne(id);
    await this.assertCanManageBde(user, event.bdeId);
    await this.prisma.event.delete({ where: { id } });
    return { message: 'Événement supprimé' };
  }

  /** Liste des participants d'un événement (admin BDE / super admin). */
  async findAttendees(user: User, eventId: string) {
    const event = await this.findOne(eventId);
    await this.assertCanManageBde(user, event.bdeId);
    return this.prisma.ticket.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, displayName: true, email: true, profilePicture: true } },
      },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  /**
   * Participants visibles pour un événement. Contrairement à `findAttendees`
   * (admin), ne renvoie que le nom et l'avatar des participants ayant un profil
   * public, sans email ni billet. Visibilité stricte : réservé aux membres du
   * BDE organisateur (et aux super admins) — un non-membre obtient une liste
   * vide, afin de ne jamais exposer les inscrits d'un BDE que l'on n'a pas rejoint.
   */
  async findPublicParticipants(user: User, eventId: string) {
    const event = await this.findOne(eventId);
    if (user.role !== Role.SUPER_ADMIN) {
      const membership = await this.prisma.bdeMember.findUnique({
        where: { userId_bdeId: { userId: user.id, bdeId: event.bdeId } },
      });
      if (!membership) return [];
    }
    const tickets = await this.prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: ['VALID', 'USED'] },
        user: { privacyLevel: 'PUBLIC' },
      },
      distinct: ['userId'],
      take: 12,
      orderBy: { purchasedAt: 'desc' },
      select: {
        user: { select: { id: true, displayName: true, profilePicture: true } },
      },
    });
    return tickets.map((t) => t.user);
  }

  /**
   * Marque manuellement la présence (USED) ou l'absence (VALID) d'un participant
   * depuis la liste, sans passer par le scan QR (admin BDE / super admin).
   */
  async setAttendeePresence(
    user: User,
    eventId: string,
    ticketId: string,
    present: boolean,
  ) {
    const event = await this.findOne(eventId);
    await this.assertCanManageBde(user, event.bdeId);

    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, eventId } });
    if (!ticket) throw new NotFoundException('Billet introuvable pour cet événement');
    if (ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED') {
      throw new BadRequestException('Billet annulé : présence non modifiable');
    }

    return this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: present ? 'USED' : 'VALID' },
      include: { user: { select: { id: true, displayName: true, email: true, profilePicture: true } } },
    });
  }

  /**
   * Retire un participant d'un événement : son billet est annulé, la place
   * libérée et, si le billet était payant, le montant est remboursé sur le
   * solde de l'utilisateur (admin BDE / super admin).
   */
  async removeAttendee(user: User, eventId: string, ticketId: string) {
    const event = await this.findOne(eventId);
    await this.assertCanManageBde(user, event.bdeId);

    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, eventId } });
    if (!ticket) throw new NotFoundException('Billet introuvable pour cet événement');
    if (ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED') {
      throw new BadRequestException('Billet déjà annulé');
    }

    return this.prisma.$transaction(async (tx) => {
      if (ticket.price > 0) {
        await tx.user.update({
          where: { id: ticket.userId },
          data: { bdeCredits: { increment: ticket.price } },
        });
        // Reprise sur la trésorerie du BDE (bornée à 0) : la recette du billet
        // avait crédité le BDE à l'achat, le remboursement la lui reprend.
        const bde = await tx.bDE.findUnique({
          where: { id: event.bdeId },
          select: { balance: true },
        });
        const decrement = Math.min(ticket.price, bde?.balance ?? 0);
        if (decrement > 0) {
          await tx.bDE.update({
            where: { id: event.bdeId },
            data: { balance: { decrement } },
          });
        }
      }
      await tx.event.update({
        where: { id: eventId },
        data: { currentAttendees: { decrement: 1 } },
      });
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELLED' } });
      return {
        message: 'Participant retiré',
        refundedAmount: ticket.price > 0 ? ticket.price : 0,
      };
    });
  }

  /** Valide un billet par son QR code (admin BDE / super admin). */
  async validateTicket(user: User, eventId: string, qrCode: string) {
    const event = await this.findOne(eventId);
    await this.assertCanManageBde(user, event.bdeId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { eventId, qrCode },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Billet introuvable pour cet événement');
    if (ticket.status === 'USED') throw new BadRequestException('Billet déjà utilisé');
    if (ticket.status !== 'VALID') throw new BadRequestException('Billet non valide');

    return this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED' },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  /** Archive automatiquement les événements publiés dont la date est passée. */
  async archivePastEvents() {
    const now = new Date();
    await this.prisma.event.updateMany({
      where: {
        status: 'PUBLISHED',
        date: { lt: now },
      },
      data: { status: 'COMPLETED' },
    });
  }
}
