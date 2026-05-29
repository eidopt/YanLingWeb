# Database Migration Runbook

> Document status: Live runbook. Keep this file aligned with backend migration
> commands, database config validation, and rollback verification.

This backend supports SQLite and PostgreSQL through TypeORM migrations. Production
must run migrations explicitly; it must not rely on TypeORM `synchronize`.

## Environment

- `DATABASE_DRIVER=sqlite` uses `DB_PATH` / `DEV_DB_PATH`.
- `DATABASE_DRIVER=postgres` uses `DATABASE_URL`, or `DB_HOST`, `DB_PORT`,
  `DB_NAME`, `DB_USERNAME` / `DB_USER`, and `DB_PASSWORD`.
- `DB_SSL=true` enables PostgreSQL SSL.
- `DB_SYNCHRONIZE=false` is required in production.

## Fresh Database

1. Set the target flavor environment variables.
2. Run the migrations:

   ```powershell
   pnpm --dir backend migration:run:prod
   ```

3. Start the backend with `DB_SYNCHRONIZE=false`.
4. Verify:

   ```powershell
   pnpm --dir backend test -- src/database/migrations/migration-rollback.spec.ts --runInBand
   pnpm typecheck:all
   pnpm build:backend
   ```

## Existing SQLite Database Created By synchronize:true

1. Stop the backend process.
2. Back up the database file before changing schema.
3. Set `DB_SYNCHRONIZE=false`.
4. Run:

   ```powershell
   pnpm --dir backend migration:run:prod
   ```

5. Run the verification commands from the fresh database flow.
6. Start the backend and smoke-test template CRUD, publish, export, and AI
   editor flows.

`SchemaUpgradeForExistingDbs1748166100000` is additive and idempotent. It adds
missing columns and indexes expected by older databases that were previously
managed by `synchronize:true`.

## PostgreSQL Cutover

1. Provision the database and user.
2. Set `DATABASE_DRIVER=postgres` and PostgreSQL connection variables.
3. Set `DB_SYNCHRONIZE=false`.
4. Run:

   ```powershell
   pnpm --dir backend migration:run:prod
   ```

5. Run the verification commands from the fresh database flow.

## Drift Checks

Run the migration rollback spec whenever migrations or entities change. The test
applies the full SQLite migration chain, verifies application tables and key
columns, reverts every migration, and checks PostgreSQL SQL generation.

Use migration generation only as a review tool against a disposable database:

```powershell
pnpm --dir backend migration:generate:dev -- src/database/migrations/SchemaDriftCheck
```

Inspect any generated diff manually. Do not commit a generated migration unless
the change is intentional and has a rollback path.

## Rollback

Use TypeORM revert for the last migration:

```powershell
pnpm --dir backend migration:revert:prod
```

For SQLite production incidents, restore the backup database file if reverting
does not match the recovery target. For PostgreSQL, prefer a tested database
snapshot restore when data movement is involved.
