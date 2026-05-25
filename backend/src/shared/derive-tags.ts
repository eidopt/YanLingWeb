/**
 * Derive search tags from template metadata.
 * Splits all string values by common delimiters and deduplicates.
 *
 * Unified implementation used by both TemplatesService and AiService.
 */
export function deriveTags(template: {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  traits: string[];
  tags?: string[];
  platformCategories?: string[];
  functionalCategories?: string[];
}): string[] {
  const values = [
    template.templateId,
    template.name,
    template.tagline,
    template.description,
    template.category,
    ...(template.platformCategories ?? []),
    ...(template.functionalCategories ?? []),
    ...template.traits,
    ...(template.tags ?? []),
  ];

  return [...new Set(
    values
      .flatMap((value) => String(value).split(/[\s,，、/|]+/))
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}
