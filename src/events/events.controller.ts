import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { ValidateTicketDto } from './dto/validate-ticket.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Liste des événements publiés (scopée aux BDE rejoints si connecté et sans bdeId explicite)' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'bdeId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser() user: User | null,
    @Query('category') category?: string,
    @Query('bdeId') bdeId?: string,
    @Query('search') search?: string,
  ) {
    return this.eventsService.findAll({ category, bdeId, search }, user);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Événements à gérer (admin BDE = ses BDE, super admin = tous)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  async findForManagement(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    await this.eventsService.archivePastEvents();
    return this.eventsService.findForManagement(user, { search, status, category });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un événement' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'S\'inscrire à un événement (gratuit)' })
  register(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.eventsService.register(userId, id);
  }

  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acheter un ou plusieurs billets (paiement simulé)' })
  purchase(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PurchaseDto,
  ) {
    return this.eventsService.purchase(
      userId,
      id,
      dto.quantity,
      dto.tierId,
      dto.paymentMethod ?? 'card',
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un événement (admin BDE)' })
  create(@CurrentUser() user: User, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un événement (admin BDE)' })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un événement (admin BDE)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.eventsService.remove(user, id);
  }

  @Get(':id/participants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Participants publics d\'un événement (nom + avatar, profils publics seulement)' })
  findParticipants(@Param('id') id: string) {
    return this.eventsService.findPublicParticipants(id);
  }

  @Get(':id/attendees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des participants d\'un événement (admin BDE)' })
  findAttendees(@CurrentUser() user: User, @Param('id') id: string) {
    return this.eventsService.findAttendees(user, id);
  }

  @Post(':id/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Valider un billet par QR code (admin BDE)' })
  validateTicket(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ValidateTicketDto,
  ) {
    return this.eventsService.validateTicket(user, id, dto.qrCode);
  }
}
