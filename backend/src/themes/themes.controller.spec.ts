import type { CreateThemeDto } from './dto/createTheme.dto';
import type { UpdateThemeDto } from './dto/updateTheme.dto';
import type { Theme } from './entities/theme.entity';
import type { ThemeRepository } from './repositories';
import { ThemesController } from './themes.controller';
import { ThemesService } from './themes.service';

interface ThemeListResult {
  data: Theme[];
  total: number;
}

interface ThemeHarness {
  controller: ThemesController;
  service: MockThemesService;
}

const unusedRepository: ThemeRepository = {
  create: () => {
    throw new Error('unused repository');
  },
  save: () => Promise.reject(new Error('unused repository')),
  findAndCountNewestFirst: () => Promise.reject(new Error('unused repository')),
  findById: () => Promise.reject(new Error('unused repository')),
  assign: () => {
    throw new Error('unused repository');
  },
  remove: () => Promise.reject(new Error('unused repository')),
};

class MockThemesService extends ThemesService {
  readonly createMock = jest.fn<Promise<Theme>, [CreateThemeDto]>();
  readonly findAllMock = jest.fn<Promise<ThemeListResult>, []>();
  readonly findOneMock = jest.fn<Promise<Theme>, [string]>();
  readonly updateMock = jest.fn<Promise<Theme>, [string, UpdateThemeDto]>();
  readonly removeMock = jest.fn<Promise<void>, [string]>();

  constructor() {
    super(unusedRepository);
  }

  override create(dto: CreateThemeDto): Promise<Theme> {
    return this.createMock(dto);
  }

  override findAll(): Promise<ThemeListResult> {
    return this.findAllMock();
  }

  override findOne(id: string): Promise<Theme> {
    return this.findOneMock(id);
  }

  override update(id: string, dto: UpdateThemeDto): Promise<Theme> {
    return this.updateMock(id, dto);
  }

  override remove(id: string): Promise<void> {
    return this.removeMock(id);
  }
}

function createTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 'theme-1',
    name: 'Theme',
    tagline: 'Tagline',
    description: 'Description',
    accent: '#111111',
    category: 'commerce',
    traits: ['modern'],
    cssVars: { '--color-primary': '#111111' },
    componentTemplates: {},
    layoutDocument: {},
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(): ThemeHarness {
  const service = new MockThemesService();
  return { controller: new ThemesController(service), service };
}

describe('ThemesController', () => {
  it('creates a theme through the service', async () => {
    const { controller, service } = createHarness();
    const dto: CreateThemeDto = { name: 'Commerce Theme', category: 'commerce' };
    const theme = createTheme({ name: dto.name, category: dto.category });
    service.createMock.mockResolvedValue(theme);

    await expect(controller.create(dto)).resolves.toBe(theme);

    expect(service.createMock).toHaveBeenCalledWith(dto);
  });

  it('lists themes through the service', async () => {
    const { controller, service } = createHarness();
    const result = { data: [createTheme()], total: 1 };
    service.findAllMock.mockResolvedValue(result);

    await expect(controller.findAll()).resolves.toBe(result);

    expect(service.findAllMock).toHaveBeenCalledWith();
  });

  it('finds one theme through the service', async () => {
    const { controller, service } = createHarness();
    const theme = createTheme({ id: 'theme-2' });
    service.findOneMock.mockResolvedValue(theme);

    await expect(controller.findOne('theme-2')).resolves.toBe(theme);

    expect(service.findOneMock).toHaveBeenCalledWith('theme-2');
  });

  it('updates a theme through the service', async () => {
    const { controller, service } = createHarness();
    const dto: UpdateThemeDto = { tagline: 'Updated' };
    const theme = createTheme({ id: 'theme-3', tagline: 'Updated' });
    service.updateMock.mockResolvedValue(theme);

    await expect(controller.update('theme-3', dto)).resolves.toBe(theme);

    expect(service.updateMock).toHaveBeenCalledWith('theme-3', dto);
  });

  it('removes a theme through the service', async () => {
    const { controller, service } = createHarness();
    service.removeMock.mockResolvedValue(undefined);

    await expect(controller.remove('theme-4')).resolves.toBeUndefined();

    expect(service.removeMock).toHaveBeenCalledWith('theme-4');
  });
});
