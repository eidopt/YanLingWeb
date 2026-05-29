import type { CreateThemeDto } from '../dto/create-theme.dto';
import type { UpdateThemeDto } from '../dto/update-theme.dto';
import type { Theme } from '../entities/theme.entity';

export const THEME_REPOSITORY = Symbol('THEME_REPOSITORY');

export interface ThemeRepository {
  create(input: CreateThemeDto): Theme;
  save(theme: Theme): Promise<Theme>;
  findAndCountNewestFirst(): Promise<[Theme[], number]>;
  findById(id: string): Promise<Theme | null>;
  assign(theme: Theme, input: UpdateThemeDto): Theme;
  remove(theme: Theme): Promise<void>;
}
