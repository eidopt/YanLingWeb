import { PartialType } from '@nestjs/swagger';

import { CreateThemeDto } from './createTheme.dto';

export class UpdateThemeDto extends PartialType(CreateThemeDto) {}
