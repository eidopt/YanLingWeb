import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateThemeDto } from '../dto/createTheme.dto';
import type { UpdateThemeDto } from '../dto/updateTheme.dto';
import { Theme } from '../entities/theme.entity';
import type { ThemeRepository } from './theme.repository';

@Injectable()
export class TypeOrmThemeRepository implements ThemeRepository {
  constructor(
    @InjectRepository(Theme)
    private readonly repo: Repository<Theme>,
  ) {}

  create(input: CreateThemeDto): Theme {
    return this.repo.create(input);
  }

  save(theme: Theme): Promise<Theme> {
    return this.repo.save(theme);
  }

  findAndCountNewestFirst(): Promise<[Theme[], number]> {
    return this.repo.findAndCount({
      order: { createdAt: 'DESC' },
    });
  }

  findById(id: string): Promise<Theme | null> {
    return this.repo.findOne({ where: { id } });
  }

  assign(theme: Theme, input: UpdateThemeDto): Theme {
    return this.repo.merge(theme, input);
  }

  async remove(theme: Theme): Promise<void> {
    await this.repo.remove(theme);
  }
}
