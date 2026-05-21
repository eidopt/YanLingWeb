import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  type PublishSiteInput,
  type RollbackSiteInput,
  SitesService,
} from './sites.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; };
}

@ApiTags('sites')
@Controller()
export class SitesController {
  constructor(private readonly service: SitesService) {}

  @Post('sites')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Publish an owned template as a hosted runtime site' })
  publish(
    @Req() req: AuthenticatedRequest,
    @Body() body: PublishSiteInput,
  ) {
    return this.service.publish(req.user.sub, body);
  }

  @Post('sites/:id/revisions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Publish a new revision for a hosted site' })
  republish(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.republish(req.user.sub, id);
  }

  @Get('sites/mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List hosted sites owned by the current user' })
  findMine(@Req() req: AuthenticatedRequest) {
    return this.service.findMine(req.user.sub);
  }

  @Get('sites/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get an owned hosted site' })
  getOwned(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.getOwned(req.user.sub, id);
  }

  @Post('sites/:id/rollback')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Roll a hosted site back to a previous revision' })
  rollback(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RollbackSiteInput,
  ) {
    return this.service.rollback(req.user.sub, id, body);
  }

  @Get('public/sites/:subdomain')
  @ApiOperation({ summary: 'Resolve a public hosted runtime site' })
  resolvePublic(@Param('subdomain') subdomain: string) {
    return this.service.resolvePublic(subdomain);
  }
}
