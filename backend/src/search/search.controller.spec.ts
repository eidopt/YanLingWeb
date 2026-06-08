import type { SearchIntentResponse } from '@shared/types/search.types';

import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import type { TemplateReadRepository } from '../templates/repositories/templateRead.repository';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const unusedRepository: TemplateReadRepository = {
  searchPublicTemplates: () => Promise.reject(new Error('unused repository')),
  findDiversitySummaries: () => Promise.reject(new Error('unused repository')),
  findOwnedPublishSnapshot: () => Promise.reject(new Error('unused repository')),
  findAccessibleIdentity: () => Promise.reject(new Error('unused repository')),
};

class MockSearchService extends SearchService {
  readonly handleInputMock = jest.fn<Promise<SearchIntentResponse>, [string, string]>();

  constructor() {
    super(unusedRepository);
  }

  override handleInput(ownerUserId: string, query: string): Promise<SearchIntentResponse> {
    return this.handleInputMock(ownerUserId, query);
  }
}

interface SearchHarness {
  controller: SearchController;
  service: MockSearchService;
}

function createRequest(userId = 'user-1'): AuthenticatedRequest {
  return { user: { sub: userId, username: 'alice' } } as AuthenticatedRequest;
}

function createHarness(): SearchHarness {
  const service = new MockSearchService();
  return { controller: new SearchController(service), service };
}

describe('SearchController', () => {
  it('submits a string query for the authenticated user', async () => {
    const { controller, service } = createHarness();
    const response: SearchIntentResponse = {
      status: 'ok',
      mode: 'search_templates',
      query: 'find commerce',
      results: [],
      total: 0,
    };
    service.handleInputMock.mockResolvedValue(response);

    const result = controller.submit(createRequest(), { query: 'find commerce' });

    await expect(result).resolves.toBe(response);

    expect(service.handleInputMock).toHaveBeenCalledWith('user-1', 'find commerce');
  });

  it('normalizes non-string query values to an empty query before service validation', async () => {
    const { controller, service } = createHarness();
    const response: SearchIntentResponse = {
      status: 'ok',
      mode: 'search_templates',
      query: '',
      results: [],
      total: 0,
    };
    service.handleInputMock.mockResolvedValue(response);

    const result = controller.submit(createRequest('user-2'), { query: 123 });

    await expect(result).resolves.toBe(response);

    expect(service.handleInputMock).toHaveBeenCalledWith('user-2', '');
  });
});
