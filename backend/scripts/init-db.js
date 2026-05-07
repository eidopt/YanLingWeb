#!/usr/bin/env node
/**
 * init-db.js — Ensure the SQLite database directory exists before NestJS starts.
 * TypeORM with synchronize:true will create the tables automatically,
 * but the parent directory must exist first.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SERVER_FLAVOR_ENV_NAME = 'SERVER_FLAVOR';

const serverFlavor = resolveServerFlavor();
process.env[SERVER_FLAVOR_ENV_NAME] = serverFlavor;
process.env.NODE_ENV = serverFlavor;

loadEnvFiles(envFilePaths(serverFlavor));

const dbPath = readEnv(serverFlavor, 'DB_PATH')
  ?? readEnv(serverFlavor, 'DEFAULT_DB_PATH');

if (!dbPath) {
  console.error('[db:init] Missing required environment variable: DEFAULT_DB_PATH');
  process.exit(1);
}

const resolvedDbPath = path.resolve(process.cwd(), dbPath);
const dbDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`[db:init] Created database directory: ${dbDir}`);
} else {
  console.log(`[db:init] Database directory already exists: ${dbDir}`);
}

if (!fs.existsSync(resolvedDbPath)) {
  // Touch the file so better-sqlite3 gets a clean slate
  fs.writeFileSync(resolvedDbPath, '');
  console.log(`[db:init] Created SQLite database file: ${resolvedDbPath}`);
} else {
  console.log(`[db:init] SQLite database already exists: ${resolvedDbPath}`);
}

console.log('[db:init] Done. Starting NestJS...');

function resolveServerFlavor() {
  return normalizeServerFlavor(readCliServerFlavor())
    ?? normalizeServerFlavor(process.env[SERVER_FLAVOR_ENV_NAME])
    ?? normalizeServerFlavor(process.env.NODE_ENV)
    ?? 'development';
}

function readCliServerFlavor() {
  const flags = ['--flavor', '--env', '--server-flavor'];

  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    const matchedInlineFlag = flags.find((flag) => arg.startsWith(`${flag}=`));
    if (matchedInlineFlag) {
      return arg.slice(matchedInlineFlag.length + 1);
    }

    if (flags.includes(arg)) {
      return process.argv[index + 1];
    }
  }

  return undefined;
}

function normalizeServerFlavor(value) {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === 'prod' || normalized === 'production') {
    return 'production';
  }
  if (normalized === 'dev' || normalized === 'development') {
    return 'development';
  }
  if (normalized === 'test') {
    return 'test';
  }
  return undefined;
}

function envFilePaths(flavor) {
  const aliases = envFileAliases(flavor);
  return aliases.flatMap((alias) => [`.env.${alias}.local`, `.env.${alias}`]);
}

function envFileAliases(flavor) {
  if (flavor === 'production') {
    return ['prod', 'production'];
  }
  if (flavor === 'test') {
    return ['test'];
  }
  return ['dev', 'development'];
}

function loadEnvFiles(filePaths) {
  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      continue;
    }

    const parsed = dotenv.parse(fs.readFileSync(resolvedPath));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readEnv(flavor, name) {
  return clean(process.env[`${scopePrefix(flavor)}_${name}`])
    ?? clean(process.env[name]);
}

function scopePrefix(flavor) {
  if (flavor === 'production') {
    return 'PROD';
  }
  if (flavor === 'test') {
    return 'TEST';
  }
  return 'DEV';
}

function clean(value) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
