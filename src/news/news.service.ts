import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, User } from '@prisma/client';
import { NewsPost, NewsPostDocument } from './schemas/news-post.schema';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { detectProfanity } from '../common/profanity';

@Injectable()
export class NewsService {
  constructor(
    @InjectModel(NewsPost.name)
    private readonly newsPostModel: Model<NewsPostDocument>,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Premier niveau de modération : refuse la publication si le contenu comporte
   * des grossièretés. Le message signale les termes détectés à l'auteur.
   */
  private assertClean(content?: string) {
    if (!content) return;
    const found = detectProfanity(content);
    if (found.length > 0) {
      throw new BadRequestException(
        `Contenu inapproprié détecté (${found.join(', ')}). Merci de reformuler.`,
      );
    }
  }

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
   * Fil d'actualités. Sans `bdeId` explicite et pour un appelant connu, le
   * fil est scopé aux BDE que l'utilisateur a rejoints (comme pour les
   * événements) — sans adhésion, fil vide.
   */
  async findAll(bdeId?: string, search?: string, user?: User | null) {
    const filter: Record<string, unknown> = {};
    if (bdeId) {
      filter.bdeId = bdeId;
    } else if (user) {
      const memberships = await this.prisma.bdeMember.findMany({
        where: { userId: user.id },
        select: { bdeId: true },
      });
      if (memberships.length === 0) return [];
      filter.bdeId = { $in: memberships.map((m) => m.bdeId) };
    }
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ content: regex }, { bdeName: regex }];
    }
    return this.newsPostModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /** Nombre total de publications (compteur admin). */
  countAll() {
    return this.newsPostModel.countDocuments().exec();
  }

  async findOne(id: string) {
    const post = await this.newsPostModel.findById(id).exec();
    if (!post) throw new NotFoundException('Publication introuvable');
    return post;
  }

  async toggleLike(userId: string, postId: string) {
    const post = await this.findOne(postId);

    const alreadyLiked = post.likedByUserIds.includes(userId);

    if (alreadyLiked) {
      post.likedByUserIds = post.likedByUserIds.filter((id) => id !== userId);
      post.likesCount = Math.max(0, post.likesCount - 1);
      await post.save();
      return { liked: false, likesCount: post.likesCount };
    }

    post.likedByUserIds.push(userId);
    post.likesCount += 1;
    await post.save();
    return { liked: true, likesCount: post.likesCount };
  }

  async create(user: User, dto: CreateNewsDto) {
    const bde = await this.prisma.bDE.findUnique({ where: { id: dto.bdeId } });
    if (!bde) throw new NotFoundException('BDE introuvable');
    await this.assertCanManageBde(user, dto.bdeId);
    this.assertClean(dto.content);

    return this.newsPostModel.create({
      bdeId: bde.id,
      bdeSlug: bde.slug,
      bdeName: bde.name,
      bdeLogo: bde.logo ?? undefined,
      content: dto.content,
      image: dto.image,
      likedByUserIds: [],
      likesCount: 0,
    });
  }

  async update(user: User, id: string, dto: UpdateNewsDto) {
    const post = await this.findOne(id);
    await this.assertCanManageBde(user, post.bdeId);
    this.assertClean(dto.content);
    const updated = await this.newsPostModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    return updated;
  }

  async remove(user: User, id: string) {
    const post = await this.findOne(id);
    await this.assertCanManageBde(user, post.bdeId);
    await this.newsPostModel.findByIdAndDelete(id).exec();
    return { message: 'Publication supprimée' };
  }
}
