export const exportDialogContent = {
  title: 'Export and publish',
  close: 'Close',
  projectNameLabel: 'Project name',
  projectNamePlaceholder: 'Example: my-app',
  subdomainLabel: 'Public subdomain',
  subdomainPlaceholder: 'example: my-app-preview',

  publishOnline: {
    title: 'Publish online',
    description:
      'Hosted apps should be edited online and republished from YanLingWeb.',
    button: 'Publish online',
    publishing: 'Publishing...',
    successMessage: (path: string) => `Published at ${path}`,
  },

  sourceExport: {
    title: 'Export maintainable React project',
    description: [
      'React source export is for downstream manual development',
      'and is not guaranteed to round-trip back into YanLingWeb.',
    ].join(' '),
    badge: 'Deterministic',
    button: 'Export React project',
    building: 'Building...',
    successMessage: (path: string) => `Exported to ${path}`,
    openFolder: 'Open output folder',
  },

  saveJson: {
    title: 'Download layout JSON',
    description:
      'Save the canonical ThemeLayoutDocument for debugging, backup, or custom tooling.',
    button: 'Download JSON',
    buttonElectron: 'Save JSON',
    successMessage: 'Saved',
  },

  errors: {
    noCanvases: 'There are no canvases to export.',
    missingToken: 'Sign in before publishing online.',
    publishFailed: (msg: string) => `Publish failed: ${msg}`,
    buildFailed: (msg: string) => `Build failed: ${msg}`,
  },
} as const;
