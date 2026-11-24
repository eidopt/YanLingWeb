import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import type { AgentEvalScenario } from '@shared/agent/contracts/agent';

import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwtAuth.guard';
import { ConfigService } from '../config/config.service';
import { AgentRunnerService } from './agentRunner.service';
import { AgentEvalRequestDto } from './dto/aiRequest.dto';

@Controller('ai/agent-eval')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AgentEvalController {
  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly config: ConfigService,
  ) {}

  @Post('mock')
  runMockScenario(@Body() scenario: AgentEvalRequestDto) {
    if (this.config.serverFlavor === 'production' && !this.config.enableAgentEvalEndpoint) {
      throw new ForbiddenException('Agent eval endpoint is disabled in production');
    }
    return this.agentRunner.runMockScenario(scenario as AgentEvalScenario);
  }

  @Post('live')
  runLiveScenario(@Body() scenario: AgentEvalRequestDto) {
    if (this.config.serverFlavor === 'production' && !this.config.enableAgentEvalEndpoint) {
      throw new ForbiddenException('Agent eval endpoint is disabled in production');
    }
    return this.agentRunner.runLiveScenario(scenario as AgentEvalScenario);
  }
}
