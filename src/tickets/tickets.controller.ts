import { Controller, Get, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes billets' })
  findMine(@Request() req: any) {
    return this.ticketsService.findMyTickets(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un billet' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.ticketsService.findOne(req.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Annuler un billet' })
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.ticketsService.cancel(req.user.id, id);
  }
}
