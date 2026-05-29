import type { AddressInfo } from 'node:net';

import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
  type TemplateSearchRecord,
} from '../templates/repositories/template-read.repository';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const TEST_TOKEN = 'e2e-token';

type SearchPublicTemplatesInput = Parameters<TemplateReadRepository['searchPublicTemplates']>[0];
type FindDiversitySummariesInput = Parameters<TemplateReadRepository['findDiversitySummaries']>[0];
type FindOwnedPublishSnapshotInput = Parameters<TemplateReadRepository['findOwnedPublishSnapshot']>;
type FindAccessibleIdentityInput = Parameters<TemplateReadRepository['findAccessibleIdentity']>;

interface MockTemplateReadRepository extends TemplateReadRepository {
  searchPublicTemplates: jest.Mock<
    ReturnType<TemplateReadRepository['searchPublicTemplates']>,
    [SearchPublicTemplatesInput]
  >;
  findDiversitySummaries: jest.Mock<
    ReturnType<TemplateReadRepository['findDiversitySummaries']>,
    [FindDiversitySummariesInput]
  >;
  findOwnedPublishSnapshot: jest.Mock<
    ReturnType<TemplateReadRepository['findOwnedPublishSnapshot']>,
    FindOwnedPublishSnapshotInput
  >;
  findAccessibleIdentity: jest.Mock<
    ReturnType<TemplateReadRepository['findAccessibleIdentity']>,
    FindAccessibleIdentityInput
  >;
}

interface E2eHeaders {
  authorization?: string;
}

interface E2eUser {
  sub: string;
  username: string;
}

interface E2eRequest {
  headers: E2eHeaders;
  user?: E2eUser;
}

interface HttpServerWithAddress {
  address(): AddressInfo | string | null;
}

const mockTemplates: TemplateSearchRecord[] = [
  {
    templateId: 'shop-fashion',
    name: 'Fashion Store',
    tagline: 'Trend-focused shopping',
    description: 'A storefront template for apparel and accessories.',
    category: 'commerce',
    displayCategory: 'commerce',
    tags: ['commerce', 'fashion'],
    traits: ['premium'],
    accent: '#E91E63',
  },
  {
    templateId: 'food-restaurant',
    name: 'Restaurant Ordering',
    tagline: 'Food delivery and menu browsing',
    description: 'A local-service template for food ordering.',
    category: 'service',
    displayCategory: 'service',
    tags: ['food', 'booking'],
    traits: ['warm'],
    accent: '#FF5722',
  },
];

interface SearchResponseBody {
  status?: string;
  mode?: string;
  query?: string;
  results?: unknown[];
  total?: number;
  statusCode?: number;
  message?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function postSearch(baseUrl: string, query: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
}

async function readJson(response: Response): Promise<SearchResponseBody> {
  const body = (await response.json()) as unknown;
  return isRecord(body) ? body : {};
}

describe('Search (e2e)', () => {
  let app: INestApplication | null = null;
  let baseUrl: string;
  let templateRepo: MockTemplateReadRepository;

  beforeAll(async () => {
    templateRepo = {
      searchPublicTemplates: jest.fn((_input: SearchPublicTemplatesInput) =>
        Promise.resolve(mockTemplates),
      ),
      findDiversitySummaries: jest.fn((_input: FindDiversitySummariesInput) => Promise.resolve([])),
      findOwnedPublishSnapshot: jest.fn((_ownerUserId: string, _templateId: string) =>
        Promise.resolve(null),
      ),
      findAccessibleIdentity: jest.fn((_ownerUserId: string, _templateId: string) =>
        Promise.resolve(null),
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        SearchService,
        {
          provide: TEMPLATE_READ_REPOSITORY,
          useValue: templateRepo,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn((context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<E2eRequest>();
          if (request.headers.authorization !== `Bearer ${TEST_TOKEN}`) {
            throw new UnauthorizedException('Missing token');
          }
          request.user = { sub: 'user-e2e', username: 'E2E User' };
          return true;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    const server = app.getHttpServer() as HttpServerWithAddress;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('E2E test server did not expose a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app !== null) {
      await app.close();
    }
  });

  it('rejects unauthenticated requests', async () => {
    const response = await postSearch(baseUrl, 'commerce template');
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.statusCode).toBe(401);
  });

  it('rejects empty queries', async () => {
    const response = await postSearch(baseUrl, '', TEST_TOKEN);
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.statusCode).toBe(400);
  });

  it('returns template results for search intent', async () => {
    const response = await postSearch(baseUrl, 'show commerce templates', TEST_TOKEN);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.mode).toBe('search_templates');
    expect(body.total).toBe(2);
    expect(body.results).toHaveLength(2);
    expect(templateRepo.searchPublicTemplates).toHaveBeenCalledWith({
      keywords: ['show', 'commerce', 'templates'],
      categories: ['commerce'],
      limit: 20,
    });
  });

  it('routes creation intent to AI creation mode without searching templates', async () => {
    templateRepo.searchPublicTemplates.mockClear();

    const response = await postSearch(baseUrl, 'create a booking mini app', TEST_TOKEN);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.mode).toBe('create_with_ai');
    expect(body.query).toBe('create a booking mini app');
    expect(templateRepo.searchPublicTemplates).not.toHaveBeenCalled();
  });
});
