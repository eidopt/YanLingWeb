import type { CreateExportDto } from './dto/createExport.dto';
import type { ExportRecord } from './entities/exportRecord.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import type {
  ExportRecordListResult,
  ExportRecordRepository,
} from './repositories/exportRecord.repository';

const unusedRepository: ExportRecordRepository = {
  createSaving: () => Promise.reject(new Error('unused repository')),
  markDone: () => Promise.reject(new Error('unused repository')),
  markError: () => Promise.reject(new Error('unused repository')),
  findForOwner: () => Promise.reject(new Error('unused repository')),
  findOneForOwner: () => Promise.reject(new Error('unused repository')),
  remove: () => Promise.reject(new Error('unused repository')),
};

type ExportRequest = Parameters<ExportsController['create']>[1];

class MockExportsService extends ExportsService {
  readonly createMock = jest.fn<Promise<ExportRecord>, [string, CreateExportDto]>();
  readonly findAllMock = jest.fn<Promise<ExportRecordListResult>, [string]>();
  readonly findOneMock = jest.fn<Promise<ExportRecord>, [string, string]>();
  readonly removeMock = jest.fn<Promise<void>, [string, string]>();

  constructor() {
    super(unusedRepository);
  }

  override create(ownerUserId: string, dto: CreateExportDto): Promise<ExportRecord> {
    return this.createMock(ownerUserId, dto);
  }

  override findAll(ownerUserId: string): Promise<ExportRecordListResult> {
    return this.findAllMock(ownerUserId);
  }

  override findOne(ownerUserId: string, id: string): Promise<ExportRecord> {
    return this.findOneMock(ownerUserId, id);
  }

  override remove(ownerUserId: string, id: string): Promise<void> {
    return this.removeMock(ownerUserId, id);
  }
}

function createRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    id: 'export-1',
    ownerUserId: 'user-1',
    projectName: 'Project',
    themeId: 'theme-1',
    status: 'saving',
    layoutJson: { root: true },
    outputPath: null,
    errorMessage: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(): {
  controller: ExportsController;
  service: MockExportsService;
  req: ExportRequest;
} {
  const service = new MockExportsService();
  const req: ExportRequest = {
    user: { sub: 'user-1', username: 'alice' },
  } as ExportRequest;

  return {
    controller: new ExportsController(service),
    service,
    req,
  };
}

describe('ExportsController', () => {
  it('creates an export for the authenticated user', async () => {
    const { controller, service, req } = createHarness();
    const dto: CreateExportDto = {
      projectName: 'Landing Page',
      themeId: 'theme-commerce',
      layoutJson: { page: 'home' },
    };
    const record = createRecord({ projectName: dto.projectName, themeId: dto.themeId });
    service.createMock.mockResolvedValue(record);

    await expect(controller.create(dto, req)).resolves.toBe(record);

    expect(service.createMock).toHaveBeenCalledWith('user-1', dto);
  });

  it('lists export records for the authenticated user', async () => {
    const { controller, service, req } = createHarness();
    const list: ExportRecordListResult = { data: [createRecord()], total: 1 };
    service.findAllMock.mockResolvedValue(list);

    await expect(controller.findAll(req)).resolves.toBe(list);

    expect(service.findAllMock).toHaveBeenCalledWith('user-1');
  });

  it('finds one export record for the authenticated user', async () => {
    const { controller, service, req } = createHarness();
    const record = createRecord({ id: 'export-2' });
    service.findOneMock.mockResolvedValue(record);

    await expect(controller.findOne('export-2', req)).resolves.toBe(record);

    expect(service.findOneMock).toHaveBeenCalledWith('user-1', 'export-2');
  });

  it('removes an export record for the authenticated user', async () => {
    const { controller, service, req } = createHarness();
    service.removeMock.mockResolvedValue(undefined);

    await expect(controller.remove('export-3', req)).resolves.toBeUndefined();

    expect(service.removeMock).toHaveBeenCalledWith('user-1', 'export-3');
  });
});
