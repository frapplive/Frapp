import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { RESERVED_TENANT_SLUGS } from '@repo/validation';

/**
 * The reserved tenant slugs exist twice (ADR-27 decision 5, #5918):
 * `RESERVED_TENANT_SLUGS` in `@repo/validation`, which the API and both
 * clients check a chosen slug against, and `public.is_reserved_tenant_slug`
 * in the database, which keeps the default slugs the insert trigger assigns
 * off them. Postgres can't import the package, so this fails while the
 * latest definition of the function in `supabase/migrations` lists a
 * different set of words. A word added to the package needs a migration
 * that redefines the function.
 */
const MIGRATIONS = join(__dirname, '../../../../../supabase/migrations');
const DEFINITION =
  /create or replace function public\.is_reserved_tenant_slug\b[\s\S]*?\$\$([\s\S]*?)\$\$/i;

function latestDatabaseList(): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  let body: string | undefined;
  for (const file of files) {
    const match = DEFINITION.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    if (match) body = match[1];
  }
  if (!body) throw new Error('no migration defines is_reserved_tenant_slug');
  const words = body
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .match(/'([^']*)'/g);
  return (words ?? []).map((quoted) => quoted.slice(1, -1));
}

describe('reserved tenant slugs: package and database agree', () => {
  it('lists the same words in RESERVED_TENANT_SLUGS and is_reserved_tenant_slug', () => {
    expect([...latestDatabaseList()].sort()).toEqual(
      [...RESERVED_TENANT_SLUGS].sort(),
    );
  });
});
