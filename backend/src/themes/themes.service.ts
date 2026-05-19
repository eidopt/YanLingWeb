import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DatabaseFlushService } from '../database/database-flush.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { Theme } from './entities/theme.entity';

@Injectable()
export class ThemesService {
  constructor(
    @InjectRepository(Theme)
    private readonly repo: Repository<Theme>,
    private readonly databaseFlush: DatabaseFlushService,
  ) {}

  async create(dto: CreateThemeDto): Promise<Theme> {
    const theme = this.repo.create(dto);
    const saved = await this.repo.save(theme);
    await this.databaseFlush.flush('theme creation');
    return saved;
  }

  async findAll(): Promise<{ data: Theme[]; total: number; }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findOne(id: string): Promise<Theme> {
    const theme = await this.repo.findOne({ where: { id } });
    if (!theme) {
      throw new NotFoundException(`Theme ${id} not found`);
    }
    return theme;
  }

  async update(id: string, dto: UpdateThemeDto): Promise<Theme> {
    const theme = await this.findOne(id);
    Object.assign(theme, dto);
    const saved = await this.repo.save(theme);
    await this.databaseFlush.flush('theme update');
    return saved;
  }

  async remove(id: string): Promise<void> {
    const theme = await this.findOne(id);
    await this.repo.remove(theme);
    await this.databaseFlush.flush('theme removal');
  }
}
