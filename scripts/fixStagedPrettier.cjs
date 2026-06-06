const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// 获取 staged 文件列表
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
  cwd: repoRoot,
}).trim();

if (!staged) {
  console.log('No staged files found.');
  process.exit(0);
}

const files = staged.split('\n').filter(Boolean);
console.log(`Checking ${files.length} staged file(s) for prettier formatting...`);

// 逐个 prettier --write，避免批量处理时的缓存问题
const prettierBin = require.resolve('prettier/bin/prettier.cjs');
let fixed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, [prettierBin, '--write', file], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    fixed++;
  } catch {
    // prettier 不认识的文件类型直接跳过
  }
}

console.log(`Formatted ${fixed} file(s).`);

// 重新 stage 格式化后的文件
execFileSync('git', ['add', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log('Re-staged formatted files.');
