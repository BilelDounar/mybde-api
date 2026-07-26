import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsPostDocument = NewsPost & Document;

@Schema({ timestamps: true })
export class NewsPost {
  @Prop({ required: true })
  bdeId: string;

  @Prop({ required: true })
  bdeSlug: string;

  @Prop({ required: true })
  bdeName: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  image?: string;

  @Prop({ type: [String], default: [] })
  likedByUserIds: string[];

  @Prop({ default: 0 })
  likesCount: number;
}

export const NewsPostSchema = SchemaFactory.createForClass(NewsPost);
