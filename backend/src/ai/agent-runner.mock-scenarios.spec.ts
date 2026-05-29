import type {
  AgentEvalScenario,
  AgentRunResult,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/contracts/agent';

import { AgentRunnerService } from './agent-runner.service';
import { AiService } from './ai.service';

describe('AgentRunnerService mock scenarios', () => {
  function createService(): AgentRunnerService {
    return new AgentRunnerService({} as AiService);
  }

  function collectNodes(node: ThemeLayoutNode, output: ThemeLayoutNode[] = []): ThemeLayoutNode[] {
    output.push(node);
    node.children?.forEach((child) => collectNodes(child, output));
    return output;
  }

  function findNode(
    document: ThemeLayoutDocument | undefined,
    nodeId: string,
  ): ThemeLayoutNode | undefined {
    return document?.pages
      .flatMap((page) => collectNodes(page.layout, []))
      .find((node) => node.id === nodeId);
  }

  interface ScenarioCase {
    name: string;
    scenario: AgentEvalScenario;
    assert?: (result: AgentRunResult) => void;
  }

  const templateGenerationCases: ScenarioCase[] = [
    {
      name: 'fitness booking app',
      scenario: {
        id: 'mock-template-fitness',
        group: 'semantic-matrix',
        mode: 'template_generation',
        prompt: 'Create a fitness booking app',
        expected: {
          mustHave: [
            { type: 'generated_app_has_min_pages', minPages: 3 },
            { type: 'all_pages_have_screen_root' },
            {
              type: 'generated_app_has_required_sections',
              sections: ['Fitness Studio'],
            },
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['page-1', 'page-2', 'page-3'],
            },
          ],
        },
        mock: {
          templateDomain: 'Fitness Studio',
        },
      },
    },
    {
      name: 'clinic appointment app',
      scenario: {
        id: 'mock-template-clinic',
        group: 'semantic-matrix',
        mode: 'template_generation',
        prompt: 'Create a clinic appointment app',
        expected: {
          mustHave: [
            { type: 'generated_app_has_min_pages', minPages: 3 },
            { type: 'all_pages_have_screen_root' },
            {
              type: 'generated_app_has_required_sections',
              sections: ['Clinic Care'],
            },
            {
              type: 'navigation_targets_include',
              targetPageIds: ['page-1', 'page-2', 'page-3'],
            },
          ],
        },
        mock: {
          templateDomain: 'Clinic Care',
        },
      },
    },
    {
      name: 'course learning app',
      scenario: {
        id: 'mock-template-course',
        group: 'semantic-matrix',
        mode: 'template_generation',
        prompt: 'Create a course learning app',
        expected: {
          mustHave: [
            { type: 'generated_app_has_min_pages', minPages: 3 },
            { type: 'all_pages_have_screen_root' },
            {
              type: 'generated_app_has_required_sections',
              sections: ['Course Hub'],
            },
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['page-1', 'page-2', 'page-3'],
            },
          ],
        },
        mock: {
          templateDomain: 'Course Hub',
        },
      },
    },
  ];

  it.each(templateGenerationCases)(
    'runs template-generation mock scenario: $name',
    async ({ scenario, assert }) => {
      const result = await createService().runMockScenario(scenario);

      expect(result.status).toBe('passed');
      expect(result.validation.valid).toBe(true);
      expect(result.semantic.passed).toBe(true);
      expect(result.render.passed).toBe(true);
      expect(result.toolCalls[0]?.name).toBe('generate_template');
      expect(result.finalDocument?.pages).toHaveLength(3);
      assert?.(result);
    },
  );

  const editorEditCases: ScenarioCase[] = [
    {
      name: 'single node copy update with invariant checks',
      scenario: {
        id: 'mock-editor-home-title',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Change the home title copy only',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            {
              type: 'node_prop_equals',
              nodeId: 'home-title',
              prop: 'text',
              value: 'Weekly deals',
            },
          ],
          mustNotChange: [
            { type: 'node_exists', nodeId: 'orders-status-title' },
            { type: 'page_count_equals', count: 3 },
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['home', 'orders', 'profile'],
            },
          ],
          allowedChanges: [{ path: 'pages' }, { path: 'layout' }],
        },
        mock: {
          operations: [
            {
              type: 'update_props',
              nodeId: 'home-title',
              props: { text: 'Weekly deals' },
              select: true,
            },
          ],
        },
      },
      assert: (result) => {
        expect(result.toolCalls[0]?.result).toMatchObject({
          selectedNodeId: 'home-title',
        });
      },
    },
    {
      name: 'semantic landmark update without internal ids',
      scenario: {
        id: 'mock-editor-semantic-targets',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Update the primary CTA and search box without using internal ids',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            {
              type: 'node_prop_equals',
              nodeId: 'home-primary-button',
              prop: 'label',
              value: 'Book today',
            },
            {
              type: 'node_prop_equals',
              nodeId: 'home-search',
              prop: 'placeholder',
              value: 'Search fresh deals',
            },
          ],
          mustNotChange: [
            { type: 'page_count_equals', count: 3 },
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['home', 'orders', 'profile'],
            },
          ],
          allowedChanges: [{ path: 'pages' }, { path: 'layout' }],
        },
        mock: {
          operations: [
            {
              type: 'update_props',
              semanticTarget: 'primary_cta',
              props: { label: 'Book today' },
              select: true,
            },
            {
              type: 'update_props',
              semanticTarget: 'search_box',
              props: { placeholder: 'Search fresh deals' },
              select: false,
            },
          ],
        },
      },
      assert: (result) => {
        expect(result.toolCalls[0]?.result).toMatchObject({
          selectedNodeId: 'home-primary-button',
        });
      },
    },
    {
      name: 'new campaign page from reference with synced navigation',
      scenario: {
        id: 'mock-editor-create-campaign-page',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Create a campaign page from the home page and sync navigation',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            { type: 'page_count_delta', delta: 1 },
            { type: 'page_exists', pageId: 'campaign' },
            { type: 'new_page_has_min_nodes', minNodes: 4 },
            { type: 'document_contains_text', value: 'Campaign launch' },
            {
              type: 'navigation_targets_include',
              targetPageIds: ['home', 'orders', 'profile', 'campaign'],
            },
          ],
          mustNotChange: [{ type: 'node_exists', nodeId: 'home-title' }],
          allowedChanges: [
            { path: 'pageName' },
            { path: 'pages' },
            { path: 'layout' },
            { path: 'defaultPageId' },
          ],
        },
        mock: {
          operations: [
            {
              type: 'create_page_from_reference',
              pageId: 'campaign',
              name: 'Campaign',
              referencePageId: 'home',
              rootNodeId: 'campaign-screen',
              rootProps: { title: 'Campaign' },
              referenceNodeUpdates: [
                {
                  referenceNodeId: 'home-title',
                  props: { text: 'Campaign launch' },
                },
              ],
              omitReferenceNodeIds: ['home-search'],
              activate: true,
              syncNavigation: true,
            },
          ],
        },
      },
      assert: (result) => {
        expect(result.finalDocument?.defaultPageId).toBe('campaign');
        expect(findNode(result.finalDocument, 'campaign-home-search')).toBeUndefined();
      },
    },
    {
      name: 'insert notice into an existing service card',
      scenario: {
        id: 'mock-editor-insert-service-notice',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Add a member notice inside the service card',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            { type: 'node_exists', nodeId: 'home-service-notice' },
            {
              type: 'node_prop_equals',
              nodeId: 'home-service-notice',
              prop: 'text',
              value: 'Members save more',
            },
            {
              type: 'node_alias_equals',
              nodeId: 'home-service-notice',
              alias: 'core.notice',
            },
          ],
          mustNotChange: [
            { type: 'node_exists', nodeId: 'home-service-button' },
            { type: 'page_count_equals', count: 3 },
          ],
          allowedChanges: [{ path: 'pages' }, { path: 'layout' }],
        },
        mock: {
          operations: [
            {
              type: 'insert_node',
              pageId: 'home',
              parentId: 'home-service-card',
              alias: 'core.notice',
              nodeId: 'home-service-notice',
              props: { text: 'Members save more', tone: 'success' },
              select: true,
            },
          ],
        },
      },
      assert: (result) => {
        expect(result.toolCalls[0]?.result).toMatchObject({
          selectedNodeId: 'home-service-notice',
        });
      },
    },
    {
      name: 'delete duplicate CTA while preserving navigation',
      scenario: {
        id: 'mock-editor-delete-duplicate-cta',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Remove the duplicate product card CTA',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            { type: 'node_not_exists', nodeId: 'home-duplicate-button' },
            { type: 'node_exists', nodeId: 'home-primary-button' },
          ],
          mustNotChange: [
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['home', 'orders', 'profile'],
            },
            { type: 'page_count_equals', count: 3 },
          ],
          allowedChanges: [{ path: 'pages' }, { path: 'layout' }],
        },
        mock: {
          operations: [
            {
              type: 'delete_node',
              pageId: 'home',
              nodeId: 'home-duplicate-button',
            },
          ],
        },
      },
      assert: (result) => {
        expect(result.toolCalls[0]?.result).toMatchObject({
          selectedNodeId: null,
        });
      },
    },
    {
      name: 'layout frame and interaction patches',
      scenario: {
        id: 'mock-editor-layout-frame-interactions',
        group: 'semantic-matrix',
        mode: 'editor_edit',
        prompt: 'Resize the product panel and wire the main CTA to orders',
        startDocument: 'commerce-market',
        expected: {
          mustHave: [
            {
              type: 'navigation_targets_exact',
              targetPageIds: ['home', 'orders', 'profile'],
            },
            { type: 'node_exists', nodeId: 'home-primary-button' },
          ],
          mustNotChange: [
            { type: 'node_exists', nodeId: 'home-title' },
            { type: 'page_count_equals', count: 3 },
          ],
          allowedChanges: [{ path: 'pages' }, { path: 'layout' }],
        },
        mock: {
          operations: [
            {
              type: 'set_layout',
              pageId: 'home',
              nodeId: 'home-product-panel',
              layout: { width: '92%' },
              select: false,
            },
            {
              type: 'set_frame',
              pageId: 'home',
              nodeId: 'home-primary-button',
              frame: { x: 12, y: 24, width: 160, height: 48 },
              select: false,
            },
            {
              type: 'update_interactions',
              pageId: 'home',
              nodeId: 'home-primary-button',
              interactions: { onClick: { type: 'navigate', targetPageId: 'orders' } },
              select: true,
            },
          ],
        },
      },
      assert: (result) => {
        const panel = findNode(result.finalDocument, 'home-product-panel');
        const button = findNode(result.finalDocument, 'home-primary-button');

        expect(panel?.layout.width).toBe('92%');
        expect(button?.layout.mode).toBe('absolute');
        expect(button?.frame).toMatchObject({ x: 12, y: 24, width: 160, height: 48 });
        expect(button?.interactions?.onClick).toEqual({
          type: 'navigate',
          targetPageId: 'orders',
        });
      },
    },
  ];

  it.each(editorEditCases)(
    'runs editor-edit mock scenario: $name',
    async ({ scenario, assert }) => {
      const result = await createService().runMockScenario(scenario);

      expect(result.status).toBe('passed');
      expect(result.validation.valid).toBe(true);
      expect(result.semantic.passed).toBe(true);
      expect(result.unrelatedDiff.passed).toBe(true);
      expect(result.unrelatedDiff.unrelatedChanges).toEqual([]);
      expect(result.render.passed).toBe(true);
      expect(result.toolCalls[0]?.name).toBe('apply_editor_edits');
      assert?.(result);
    },
  );

  it('fails editor-edit mock scenarios when unrelated changes escape the allowlist', async () => {
    const scenario: AgentEvalScenario = {
      id: 'mock-editor-unrelated-diff-failure',
      group: 'semantic-matrix',
      mode: 'editor_edit',
      prompt: 'Change the home title but do not touch order status',
      startDocument: 'commerce-market',
      expected: {
        mustHave: [
          {
            type: 'node_prop_equals',
            nodeId: 'home-title',
            prop: 'text',
            value: 'Weekly deals',
          },
        ],
        allowedChanges: [{ path: 'pages.0.layout.children.1.props.text' }],
        maxUnrelatedChangeScore: 0,
      },
      mock: {
        operations: [
          {
            type: 'update_props',
            nodeId: 'home-title',
            props: { text: 'Weekly deals' },
          },
          {
            type: 'update_props',
            pageId: 'orders',
            nodeId: 'orders-status-title',
            props: { text: 'Canceled' },
          },
        ],
      },
    };

    const result = await createService().runMockScenario(scenario);

    expect(result.status).toBe('failed');
    expect(result.semantic.passed).toBe(true);
    expect(result.unrelatedDiff.passed).toBe(false);
    expect(result.unrelatedDiff.unrelatedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'pages',
          type: 'changed',
        }),
      ]),
    );
    expect(result.toolCalls[0]?.name).toBe('apply_editor_edits');
  });
});
