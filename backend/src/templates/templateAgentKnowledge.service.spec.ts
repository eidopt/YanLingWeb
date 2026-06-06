import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';

import type {
  TemplateAgentKnowledgeRecords,
  TemplateAgentKnowledgeRepository,
} from './repositories/templateAgentKnowledge.repository';
import type {
  TemplateAccessibleIdentity,
  TemplateReadRepository,
} from './repositories/templateRead.repository';
import { TemplateAgentKnowledgeService } from './templateAgentKnowledge.service';

interface FindForTemplateCall {
  templateId: string;
  fallbackTemplateId?: string;
}

class FakeTemplateAgentKnowledgeRepository implements TemplateAgentKnowledgeRepository {
  calls: FindForTemplateCall[] = [];
  records: TemplateAgentKnowledgeRecords = {
    profileGenerated: null,
    profileOverride: null,
    assets: null,
    permissions: null,
    evaluation: null,
  };

  findForTemplate(
    templateId: string,
    fallbackTemplateId?: string,
  ): Promise<TemplateAgentKnowledgeRecords> {
    this.calls.push({ templateId, ...(fallbackTemplateId ? { fallbackTemplateId } : {}) });
    return Promise.resolve(this.records);
  }
}

class FakeTemplateReadRepository implements TemplateReadRepository {
  accessible: TemplateAccessibleIdentity | null = null;
  findAccessibleIdentityCalls: [string, string][] = [];

  searchPublicTemplates(): Promise<[]> {
    return Promise.resolve([]);
  }

  findDiversitySummaries(): Promise<[]> {
    return Promise.resolve([]);
  }

  findOwnedPublishSnapshot(): Promise<null> {
    return Promise.resolve(null);
  }

  findAccessibleIdentity(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateAccessibleIdentity | null> {
    this.findAccessibleIdentityCalls.push([ownerUserId, templateId]);
    return Promise.resolve(this.accessible);
  }
}

function createTemplateDocument(templateId: string): ThemeLayoutDocument {
  const root = {
    id: 'root',
    alias: 'core.screen',
    layout: { mode: 'flow' as const },
    children: [],
  };
  return {
    version: 1,
    themeId: templateId,
    themeName: 'Test Template',
    description: 'Test document',
    components: [],
    defaultPageId: 'home',
    pages: [{ id: 'home', name: 'Home', layout: root }],
    layout: root,
  };
}

function createService() {
  const templates = new FakeTemplateReadRepository();
  const knowledge = new FakeTemplateAgentKnowledgeRepository();
  const service = new TemplateAgentKnowledgeService(templates, knowledge);
  return { service, templates, knowledge };
}

describe('TemplateAgentKnowledgeService repository boundary', () => {
  it('loads agent knowledge through accessible template identity and source fallback', async () => {
    const { service, templates, knowledge } = createService();
    templates.accessible = {
      templateId: 'owned-template',
      sourceTemplateId: 'source-template',
    };
    knowledge.records = {
      profileGenerated: { tone: 'source-profile' },
      profileOverride: null,
      assets: { hero: { url: '/template-assets/hero.png' } },
      permissions: { widgets: false },
      evaluation: { requiredChecks: ['navigation'] },
    };

    const result = await service.loadForEditor({
      ownerUserId: 'user-1',
      templateId: 'owned-template',
      document: createTemplateDocument('owned-template'),
    });

    expect(templates.findAccessibleIdentityCalls).toEqual([['user-1', 'owned-template']]);
    expect(knowledge.calls).toEqual([
      { templateId: 'owned-template', fallbackTemplateId: 'source-template' },
    ]);
    expect(result.profileGenerated).toEqual({ tone: 'source-profile' });
    expect(result.assets).toEqual({ hero: { url: '/template-assets/hero.png' } });
    expect(result.permissions).toEqual({ widgets: false });
    expect(result.evaluation).toEqual({ requiredChecks: ['navigation'] });
  });

  it('falls back to a generated profile when no persisted knowledge exists', async () => {
    const { service, templates, knowledge } = createService();
    templates.accessible = {
      templateId: 'owned-template',
      sourceTemplateId: null,
    };

    const result = await service.loadForEditor({
      ownerUserId: 'user-1',
      templateId: 'owned-template',
      document: createTemplateDocument('owned-template'),
    });

    expect(knowledge.calls).toEqual([{ templateId: 'owned-template' }]);
    expect(result.profileGenerated).toBeTruthy();
    expect(typeof result.profileGenerated).toBe('object');
    if (!result.profileGenerated || typeof result.profileGenerated !== 'object') {
      throw new Error('Expected generated profile object');
    }
    expect('templateId' in result.profileGenerated).toBe(true);
    expect('slots' in result.profileGenerated).toBe(true);
    expect(result.profileOverride).toBeNull();
  });
});
