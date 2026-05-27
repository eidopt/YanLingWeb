import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchService } from './search.service';

interface SearchInputBody {
  query?: unknown;
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Route a homepage search or creation intent' })
  submit(
    @Req() req: AuthenticatedRequest,
    @Body() body: SearchInputBody,
  ) {
    return this.service.handleInput(
      req.user.sub,
      typeof body.query === 'string' ? body.query : '',
    );
  }
}
