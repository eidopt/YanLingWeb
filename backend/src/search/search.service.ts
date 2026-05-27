import { BadRequestException, Injectable } from '@nestjs/common';

export interface SearchIntentResult {
  status: 'stub';
  mode: 'search_templates' | 'create_blank_template';
  query: string;
  message: string;
}

@Injectable()
export class SearchService {
  async handleInput(_ownerUserId: string, query: string): Promise<SearchIntentResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('query is required');
    }

    return {
      status: 'stub',
      mode: 'search_templates',
      query: normalizedQuery,
      message: 'searchService placeholder: intent routing and agent template generation are not implemented yet.',
    };
  }
}
