import { NotFoundException } from '@nestjs/common';

import type { CreateThemeDto } from './dto/createTheme.dto';
import type { UpdateThemeDto } from './dto/updateTheme.dto';
import { Theme } from './entities/theme.entity';
import type { ThemeRepository } from './repositories';
import { ThemesService } from './themes.service';

class FakeThemeRepository implements ThemeRepository {
  readonly themes = new Map<string, Theme>();
  removed: string[] = [];

  create(input: CreateThemeDto): Theme {
    return createTheme({
      id: `theme-${this.themes.size + 1}`,
      ...input,
    });
  }

  save(theme: Theme): Promise<Theme> {
    this.themes.set(theme.id, theme);
    return Promise.resolve(theme);
  }

  findAndCountNewestFirst(): Promise<[Theme[], number]> {
    const data = [...this.themes.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return Promise.resolve([data, data.length]);
  }

  findById(id: string): Promise<Theme | null> {
    return Promise.resolve(this.themes.get(id) ?? null);
  }

  assign(theme: Theme, input: UpdateThemeDto): Theme {
    Object.assign(theme, input);
    return theme;
  }

  remove(theme: Theme): Promise<void> {
    this.removed.push(theme.id);
    this.themes.delete(theme.id);
    return Promise.resolve();
  }
}

function createTheme(overrides: Partial<Theme> = {}): Theme {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return Object.assign(new Theme(), {
    id: 'theme-1',
    name: 'Theme One',
    tagline: '',
    description: '',
    accent: '#000000',
    category: 'general',
    traits: [],
    cssVars: {},
    componentTemplates: {},
    layoutDocument: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function createService() {
  const repo = new FakeThemeRepository();
  const service = new ThemesService(repo);
  return { repo, service };
}

describe('ThemesService', () => {
  it('creates themes through the repository port', async () => {
    const { repo, service } = createService();

    const theme = await service.create({ name: 'Commerce', category: 'commerce' });

    expect(theme).toMatchObject({ name: 'Commerce', category: 'commerce' });
    expect(repo.themes.get(theme.id)).toBe(theme);
  });

  it('lists themes through the repository port', async () => {
    const { repo, service } = createService();
    await repo.save(createTheme({ id: 'older', createdAt: new Date('2026-05-28T00:00:00.000Z') }));
    await repo.save(createTheme({ id: 'newer', createdAt: new Date('2026-05-29T00:00:00.000Z') }));

    await expect(service.findAll()).resolves.toMatchObject({
      total: 2,
      data: [{ id: 'newer' }, { id: 'older' }],
    });
  });

  it('throws when a theme is missing', async () => {
    const { service } = createService();

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an existing theme through assign and save', async () => {
    const { repo, service } = createService();
    await repo.save(createTheme({ id: 'theme-1', name: 'Old' }));

    await expect(service.update('theme-1', { name: 'New' })).resolves.toMatchObject({
      id: 'theme-1',
      name: 'New',
    });
  });

  it('removes an existing theme through the repository port', async () => {
    const { repo, service } = createService();
    await repo.save(createTheme({ id: 'theme-1' }));

    await service.remove('theme-1');

    expect(repo.removed).toEqual(['theme-1']);
    expect(repo.themes.has('theme-1')).toBe(false);
  });
});
