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
import { NewsService } from './news.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) { }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Fil d\'actualités (scopé aux BDE rejoints si connecté et sans bdeId explicite)' })
  @ApiQuery({ name: 'bdeId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser() user: User | null,
    @Query('bdeId') bdeId?: string,
    @Query('search') search?: string,
  ) {
    return this.newsService.findAll(bdeId, search, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une publication' })
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publier une actualité (admin BDE)' })
  create(@CurrentUser() user: User, @Body() dto: CreateNewsDto) {
    return this.newsService.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier une publication (admin BDE)' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_BDE', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une publication (admin BDE)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.newsService.remove(user, id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liker / Unliker une publication' })
  toggleLike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.newsService.toggleLike(userId, id);
  }
}
