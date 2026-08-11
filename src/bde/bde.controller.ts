import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { BdeService } from './bde.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateBdeDto } from './dto/create-bde.dto';
import { UpdateBdeDto } from './dto/update-bde.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { SetMemberAdminDto } from './dto/set-member-admin.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';

@ApiTags('BDE')
@Controller('bde')
export class BdeController {
  constructor(private readonly bdeService: BdeService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des BDE actifs' })
  findAll() {
    return this.bdeService.findAll();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BDE que j\'administre (tous si super admin)' })
  findMine(@CurrentUser() user: User) {
    return this.bdeService.findManagedByUser(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un BDE' })
  findOne(@Param('id') id: string) {
    return this.bdeService.findOne(id);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Membres d\'un BDE (admin du BDE ou super admin)' })
  getMembers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bdeService.getMembers(user, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un BDE (super admin)' })
  create(@CurrentUser() user: User, @Body() dto: CreateBdeDto) {
    return this.bdeService.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un BDE (admin)' })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateBdeDto,
  ) {
    return this.bdeService.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un BDE (super admin)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bdeService.remove(user, id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejoindre un BDE' })
  join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bdeService.join(userId, id);
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejoindre un BDE via son code d\'invitation à 6 chiffres' })
  joinByCode(@CurrentUser('id') userId: string, @Body() dto: JoinByCodeDto) {
    return this.bdeService.joinByCode(userId, dto.code);
  }

  @Post(':id/join-code/regenerate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Régénérer le code d\'invitation du BDE (admin)' })
  regenerateJoinCode(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bdeService.regenerateJoinCode(user, id);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Quitter un BDE' })
  leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bdeService.leave(userId, id);
  }

  @Post(':id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assigner un utilisateur à un BDE (super admin)' })
  assignMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.bdeService.assignMember(id, userId);
  }

  @Patch(':id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Promouvoir / rétrograder un membre admin' })
  setMemberAdmin(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetMemberAdminDto,
  ) {
    return this.bdeService.setMemberAdmin(user, id, userId, dto.isAdmin);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer un membre du BDE' })
  removeMember(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.bdeService.removeMember(user, id, userId);
  }

  @Get(':id/withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historique des retraits du BDE' })
  getWithdrawals(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bdeService.getWithdrawals(user, id);
  }

  @Post(':id/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer la trésorerie du BDE (paliers de 20 €, commission MyBDE)' })
  withdraw(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: WithdrawDto,
  ) {
    return this.bdeService.withdraw(user, id, dto.amount);
  }
}
