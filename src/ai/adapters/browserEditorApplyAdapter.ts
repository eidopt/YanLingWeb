import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from 'ui/editor/services/aiEditInstructions';

export class BrowserEditorApplyAdapter {
  constructor(
    private readonly applyInstructions: (
      instructions: readonly EditorAiEditInstruction[],
      options?: ApplyEditorAiEditInstructionsOptions,
    ) => ApplyEditorAiEditInstructionsResult,
  ) {}

  apply(
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ): ApplyEditorAiEditInstructionsResult {
    return this.applyInstructions(instructions, options);
  }
}
