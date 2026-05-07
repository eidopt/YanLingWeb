import {
  DynamicThemeRenderer,
  type DynamicThemeScreenPreset,
  useDynamicThemeRendererController,
} from '../renderer';
import styles from './ThemePreview.module.css';
import type { ThemeSpec } from 'types/theme.types';

interface ThemePreviewProps {
  theme: ThemeSpec;
  screenPreset?: DynamicThemeScreenPreset;
}

export function ThemePreview(
  { theme, screenPreset = 'mobile' }: ThemePreviewProps,
) {
  const controller = useDynamicThemeRendererController({
    layoutDocument: theme.layoutDocument,
    runtime: theme.runtime,
    screenPreset,
  });

  return (
    <div className={styles.root}>
      <DynamicThemeRenderer controller={controller} />
    </div>
  );
}
