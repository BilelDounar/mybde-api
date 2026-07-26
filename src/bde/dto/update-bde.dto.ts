import { PartialType } from '@nestjs/swagger';
import { CreateBdeDto } from './create-bde.dto';

export class UpdateBdeDto extends PartialType(CreateBdeDto) {}
