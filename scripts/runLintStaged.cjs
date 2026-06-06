const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(repoRoot, '.git-xdg');
mkdirSync(path.join(xdgConfigHome, 'git'), { recursive: true });

const lintStagedBin = require.resolve('lint-staged/bin');
const result = spawnSync(process.execPath, [lintStagedBin, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: xdgConfigHome,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
