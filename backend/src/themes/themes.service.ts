import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { CreateThemeDto } from './dto/createTheme.dto';
import { UpdateThemeDto } from './dto/updateTheme.dto';
import { Theme } from './entities/theme.entity';
import { THEME_REPOSITORY, type ThemeRepository } from './repositories';

interface ThemeListResult {
  data: Theme[];
  total: number;
}

@Injectable()
export class ThemesService {
  constructor(
    @Inject(THEME_REPOSITORY)
    private readonly themes: ThemeRepository,
  ) {}

  async create(dto: CreateThemeDto): Promise<Theme> {
    const theme = this.themes.create(dto);
    return this.themes.save(theme);
  }

  async findAll(): Promise<ThemeListResult> {
    const [data, total] = await this.themes.findAndCountNewestFirst();
    return { data, total };
  }

  async findOne(id: string): Promise<Theme> {
    const theme = await this.themes.findById(id);
    if (!theme) {
      throw new NotFoundException(`Theme ${id} not found`);
    }
    return theme;
  }

  async update(id: string, dto: UpdateThemeDto): Promise<Theme> {
    const theme = await this.findOne(id);
    return this.themes.save(this.themes.assign(theme, dto));
  }

  async remove(id: string): Promise<void> {
    const theme = await this.findOne(id);
    await this.themes.remove(theme);
  }
}
