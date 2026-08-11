import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { RechargeDto } from './dto/recharge.dto';
import { SetRoleDto } from './dto/set-role.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mon profil' })
  getMe(@Request() req: any) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Modifier mon profil' })
  updateMe(@Request() req: any, @Body() body: UpdateUserDto) {
    return this.usersService.update(req.user.id, body);
  }

  @Post('me/credits')
  @ApiOperation({ summary: 'Recharger mon solde de crédits BDE (paiement simulé)' })
  recharge(@Request() req: any, @Body() body: RechargeDto) {
    return this.usersService.creditBalance(req.user.id, body.amount);
  }

  @Get('me/export')
  @ApiOperation({ summary: 'Exporter mes données personnelles (RGPD)' })
  exportMe(@Request() req: any) {
    return this.usersService.exportData(req.user.id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Supprimer mon compte (RGPD)' })
  deleteMe(@Request() req: any) {
    return this.usersService.remove(req.user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Lister / rechercher les utilisateurs, paginé (super admin)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  search(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.search({
      search,
      role,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Changer le rôle d\'un utilisateur (super admin)' })
  setRole(@Request() req: any, @Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.usersService.setRole(req.user.id, id, dto.role);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Modifier les informations d\'un utilisateur (super admin)' })
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Supprimer un utilisateur (super admin)' })
  deleteUser(@Request() req: any, @Param('id') id: string) {
    if (req.user.id === id) {
      throw new ForbiddenException('Utilisez « Supprimer mon compte » pour votre propre compte');
    }
    return this.usersService.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Profil public d\'un utilisateur' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
