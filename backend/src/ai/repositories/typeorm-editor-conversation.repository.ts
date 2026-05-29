import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EditorAiConversation } from '../entities/editor-ai-conversation.entity';
import type {
  CreateEditorConversationInput,
  EditorConversationRepository,
} from './editor-conversation.repository';

@Injectable()
export class TypeOrmEditorConversationRepository implements EditorConversationRepository {
  constructor(
    @InjectRepository(EditorAiConversation)
    private readonly repo: Repository<EditorAiConversation>,
  ) {}

  create(input: CreateEditorConversationInput): EditorAiConversation {
    return this.repo.create(input);
  }

  save(conversation: EditorAiConversation): Promise<EditorAiConversation> {
    return this.repo.save(conversation);
  }

  async remove(conversation: EditorAiConversation): Promise<void> {
    await this.repo.remove(conversation);
  }

  findByOwnerAndTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversation | null> {
    return this.repo.findOne({ where: { ownerUserId, templateId } });
  }
}
