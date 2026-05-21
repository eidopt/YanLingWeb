import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import type { AgentEvalScenario } from '@shared/agent/types';

import { ConfigService } from '../config/config.service';
import { AgentRunnerService } from './agent-runner.service';

@Controller('ai/agent-eval')
export class AgentEvalController {
  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly config: ConfigService,
  ) {}

  @Post('mock')
  runMockScenario(@Body() scenario: AgentEvalScenario) {
    if (this.config.serverFlavor === 'production' && !this.config.enableAgentEvalEndpoint) {
      throw new ForbiddenException('Agent eval endpoint is disabled in production');
    }
    return this.agentRunner.runMockScenario(scenario);
  }

  @Post('live')
  runLiveScenario(@Body() scenario: AgentEvalScenario) {
    if (this.config.serverFlavor === 'production' && !this.config.enableAgentEvalEndpoint) {
      throw new ForbiddenException('Agent eval endpoint is disabled in production');
    }
    return this.agentRunner.runLiveScenario(scenario);
  }
}
