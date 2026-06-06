import { ForbiddenException } from '@nestjs/common';
import type { AgentEvalScenario, AgentRunResult } from '@shared/agent/contracts/agent';

import { ConfigService } from '../config/config.service';
import { AgentEvalController } from './agentEval.controller';
import { AgentRunnerService } from './agentRunner.service';
import type { AiService } from './ai.service';

const unusedAiService = {} as unknown as AiService;

class MockAgentRunnerService extends AgentRunnerService {
  readonly runMockScenarioMock = jest.fn<Promise<AgentRunResult>, [AgentEvalScenario]>();
  readonly runLiveScenarioMock = jest.fn<Promise<AgentRunResult>, [AgentEvalScenario]>();

  constructor() {
    super(unusedAiService);
  }

  override runMockScenario(scenario: AgentEvalScenario): Promise<AgentRunResult> {
    return this.runMockScenarioMock(scenario);
  }

  override runLiveScenario(scenario: AgentEvalScenario): Promise<AgentRunResult> {
    return this.runLiveScenarioMock(scenario);
  }
}

class MockConfigService extends ConfigService {
  serverFlavorValue: ConfigService['serverFlavor'] = 'development';
  enableAgentEvalEndpointValue = true;

  override get serverFlavor(): ConfigService['serverFlavor'] {
    return this.serverFlavorValue;
  }

  override get enableAgentEvalEndpoint(): boolean {
    return this.enableAgentEvalEndpointValue;
  }
}

interface AgentEvalHarness {
  controller: AgentEvalController;
  agentRunner: MockAgentRunnerService;
  config: MockConfigService;
}

function createHarness(): AgentEvalHarness {
  const agentRunner = new MockAgentRunnerService();
  const config = new MockConfigService();
  return {
    controller: new AgentEvalController(agentRunner, config),
    agentRunner,
    config,
  };
}

function createScenario(overrides: Partial<AgentEvalScenario> = {}): AgentEvalScenario {
  return {
    id: 'scenario-1',
    group: 'smoke',
    mode: 'template_generation',
    prompt: 'Build a landing page',
    expected: {},
    ...overrides,
  };
}

function createResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    scenarioId: 'scenario-1',
    mode: 'template_generation',
    prompt: 'Build a landing page',
    status: 'passed',
    events: [],
    toolCalls: [],
    validation: { valid: true, errors: [], warnings: [], score: 1 },
    semantic: { passed: true, taskScore: 1, failures: [], results: [] },
    unrelatedDiff: { passed: true, score: 0, maxScore: 0, changes: [], unrelatedChanges: [] },
    render: { passed: true, score: 1, errors: [], visibleTextCount: 1 },
    durationMs: 5,
    ...overrides,
  };
}

describe('AgentEvalController', () => {
  describe('runMockScenario', () => {
    it('forwards the scenario to the runner and resolves its result', async () => {
      const { controller, agentRunner } = createHarness();
      const scenario = createScenario();
      const result = createResult();
      agentRunner.runMockScenarioMock.mockResolvedValue(result);

      await expect(controller.runMockScenario(scenario)).resolves.toBe(result);

      expect(agentRunner.runMockScenarioMock).toHaveBeenCalledWith(scenario);
    });

    it('runs even in production when the eval endpoint is enabled', async () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'production';
      config.enableAgentEvalEndpointValue = true;
      const result = createResult();
      agentRunner.runMockScenarioMock.mockResolvedValue(result);

      await expect(controller.runMockScenario(createScenario())).resolves.toBe(result);
    });

    it('throws ForbiddenException in production when the eval endpoint is disabled', () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'production';
      config.enableAgentEvalEndpointValue = false;

      expect(() => controller.runMockScenario(createScenario())).toThrow(ForbiddenException);
      expect(agentRunner.runMockScenarioMock).not.toHaveBeenCalled();
    });

    it('allows non-production flavors even when the eval endpoint is disabled', async () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'development';
      config.enableAgentEvalEndpointValue = false;
      const result = createResult();
      agentRunner.runMockScenarioMock.mockResolvedValue(result);

      await expect(controller.runMockScenario(createScenario())).resolves.toBe(result);

      expect(agentRunner.runMockScenarioMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('runLiveScenario', () => {
    it('forwards the scenario to the runner and resolves its result', async () => {
      const { controller, agentRunner } = createHarness();
      const scenario = createScenario({ id: 'scenario-live', mode: 'editor_edit' });
      const result = createResult({ scenarioId: 'scenario-live', mode: 'editor_edit' });
      agentRunner.runLiveScenarioMock.mockResolvedValue(result);

      await expect(controller.runLiveScenario(scenario)).resolves.toBe(result);

      expect(agentRunner.runLiveScenarioMock).toHaveBeenCalledWith(scenario);
    });

    it('runs even in production when the eval endpoint is enabled', async () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'production';
      config.enableAgentEvalEndpointValue = true;
      const result = createResult();
      agentRunner.runLiveScenarioMock.mockResolvedValue(result);

      await expect(controller.runLiveScenario(createScenario())).resolves.toBe(result);
    });

    it('throws ForbiddenException in production when the eval endpoint is disabled', () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'production';
      config.enableAgentEvalEndpointValue = false;

      expect(() => controller.runLiveScenario(createScenario())).toThrow(ForbiddenException);
      expect(agentRunner.runLiveScenarioMock).not.toHaveBeenCalled();
    });

    it('allows non-production flavors even when the eval endpoint is disabled', async () => {
      const { controller, agentRunner, config } = createHarness();
      config.serverFlavorValue = 'development';
      config.enableAgentEvalEndpointValue = false;
      const result = createResult();
      agentRunner.runLiveScenarioMock.mockResolvedValue(result);

      await expect(controller.runLiveScenario(createScenario())).resolves.toBe(result);

      expect(agentRunner.runLiveScenarioMock).toHaveBeenCalledTimes(1);
    });
  });
});
