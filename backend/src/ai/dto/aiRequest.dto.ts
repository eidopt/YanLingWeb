import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Envelope for `/ai/stream` and `/ai/editor`. Nested documents stay opaque. */
export class AiChatRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  prompt?: string;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  messages?: unknown;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  document?: object;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  pages?: unknown;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  conversation?: unknown;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  selectedNode?: object | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  selectedDescriptor?: object | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  clarificationChoice?: unknown;
}

export class SaveEditorConversationDto {
  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  messages?: unknown;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  undoStack?: unknown;
}

export class SaveGeneratedTemplateDto {
  @IsString()
  @MaxLength(200)
  templateId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(400)
  tagline!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsString()
  categoryLabel?: string;

  @IsOptional()
  @IsObject()
  categoryLabels?: Record<string, string>;

  @IsOptional()
  @IsString()
  displayCategory?: string;

  @IsOptional()
  @IsString()
  displayCategoryLabel?: string;

  @IsOptional()
  @IsObject()
  displayCategoryLabels?: Record<string, string>;

  @IsOptional()
  @IsArray()
  platformCategories?: string[];

  @IsOptional()
  @IsObject()
  platformCategoryLabels?: Record<string, string>;

  @IsOptional()
  @IsArray()
  functionalCategories?: string[];

  @IsOptional()
  @IsObject()
  functionalCategoryLabels?: Record<string, string>;

  @IsString()
  @MaxLength(40)
  accent!: string;

  @IsArray()
  traits!: string[];

  @IsObject()
  cssVars!: Record<string, string>;

  @IsOptional()
  @IsObject()
  cssAnimations?: Record<string, string>;

  @IsOptional()
  @IsArray()
  visualAssets?: unknown[];

  @IsObject()
  componentTemplates!: Record<string, unknown>;

  @IsObject()
  layoutDocument!: Record<string, unknown>;
}

export class AgentEvalRequestDto {
  @IsString()
  @MaxLength(200)
  id!: string;

  @IsString()
  @MaxLength(80)
  group!: string;

  @IsString()
  @MaxLength(80)
  mode!: string;

  @IsString()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsString()
  startDocument?: string;

  @IsOptional()
  @IsString()
  selectedNodeId?: string;

  @IsObject()
  expected!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  mock?: Record<string, unknown>;
}
