const { spawn } = require('node:child_process');
const path = require('node:path');
const { compileFixtureProject, repoRoot } = require('./source-export-fixture.cjs');

const port = Number(process.env.E2E_PORT ?? 3100);
const sourceExportPort = Number(process.env.E2E_SOURCE_EXPORT_PORT ?? 3101);
const baseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const sourceExportBaseUrl = process.env.E2E_SOURCE_EXPORT_BASE_URL ?? `http://127.0.0.1:${sourceExportPort}`;
const args = process.argv.slice(2);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${url}.${detail}`);
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
}

function resolvePnpmCommand(playwrightArgs) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli) {
    return {
      command: process.execPath,
      args: [pnpmCli, 'exec', 'playwright', 'test', ...playwrightArgs],
    };
  }
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['exec', 'playwright', 'test', ...playwrightArgs],
  };
}

async function main() {
  let server = null;
  let sourceExportServer = null;
  const ownsServer = !process.env.E2E_BASE_URL;
  const ownsSourceExportServer = !process.env.E2E_SOURCE_EXPORT_BASE_URL;

  try {
    if (ownsServer) {
      server = spawn(
        process.execPath,
        ['./node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
        {
          stdio: 'inherit',
          shell: false,
          env: {
            ...process.env,
            E2E_PORT: String(port),
          },
        },
      );
      await waitForServer(`${baseUrl}/sites/e2e-static`, 120_000);
    }

    if (ownsSourceExportServer) {
      const workDir = path.join(repoRoot, '.workbuddy', 'source-export-e2e');
      const projectDir = path.join(workDir, 'project');
      compileFixtureProject({ workDir, projectDir });
      const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
      const buildResult = await run(process.execPath, [viteBin, 'build'], { cwd: projectDir });
      if (buildResult.code !== 0 || buildResult.signal) {
        process.exitCode = 1;
        return;
      }
      sourceExportServer = spawn(
        process.execPath,
        [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(sourceExportPort)],
        {
          cwd: projectDir,
          stdio: 'inherit',
          shell: false,
        },
      );
      await waitForServer(sourceExportBaseUrl, 120_000);
    }

    const playwrightCommand = resolvePnpmCommand(args);
    const result = await run(playwrightCommand.command, playwrightCommand.args, {
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_SOURCE_EXPORT_BASE_URL: sourceExportBaseUrl,
      },
    });

    if (result.signal) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = result.code ?? 1;
  } finally {
    if (server && !server.killed) {
      server.kill();
    }
    if (sourceExportServer && !sourceExportServer.killed) {
      sourceExportServer.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
