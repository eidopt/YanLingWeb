import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Template } from './entities/template.entity';
import { TEMPLATE_SEED_DATA } from './seed/template-seed.data';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(Template)
    private readonly repo: Repository<Template>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repo.upsert(
      TEMPLATE_SEED_DATA.map((data) => this.repo.create(data)) as never,
      { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
    );
  }

  async findAll(): Promise<{ data: Template[]; total: number; }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'ASC' },
    });
    return { data, total };
  }

  async findByTemplateId(templateId: string): Promise<Template> {
    const template = await this.repo.findOne({ where: { templateId } });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return template;
  }
}
