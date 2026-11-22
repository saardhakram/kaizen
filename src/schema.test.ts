// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import schema from '../supabase/schema.sql?raw';

/** Minimal stand-in for what Supabase provides: the auth schema, auth.uid(), and the two roles. */
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated;
  create role anon;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const HABIT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let db: PGlite;
async function as<T>(uid: string | null, role: 'authenticated' | 'anon', fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(schema);
  await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
  await as(A, 'authenticated', async () => {
    await db.exec(`insert into public.habits (id, name, kind) values ('${HABIT_A}', 'Workout', 'build')`);
    await db.exec(`insert into public.logs (habit_id, day, status, reason, tags) values ('${HABIT_A}', '2026-09-19', 'partial', 'not in the mood', '{not_in_mood}')`);
    await db.exec(`insert into public.user_settings (theme) values ('dark')`);
  });
});
afterAll(async () => db.close());

describe('database schema', () => {
  it('can be run twice without errors', async () => {
    await expect(db.exec(schema)).resolves.toBeDefined();
  });

  it('fills in the owner automatically and lets you read your own rows', async () => {
    const habits = await as(A, 'authenticated', () => db.query<{ user_id: string; name: string }>('select user_id, name from public.habits'));
    expect(habits.rows).toEqual([{ user_id: A, name: 'Workout' }]);
    const logs = await as(A, 'authenticated', () => db.query('select status, reason from public.logs'));
    expect(logs.rows).toEqual([{ status: 'partial', reason: 'not in the mood' }]);
  });

  it('hides everything from another account', async () => {
    for (const table of ['habits', 'logs', 'user_settings']) {
      const r = await as(B, 'authenticated', () => db.query(`select * from public.${table}`));
      expect(r.rows, table).toHaveLength(0);
    }
  });

  it("stops another account from editing or deleting your rows", async () => {
    const upd = await as(B, 'authenticated', () => db.query(`update public.habits set name = 'hacked' where id = '${HABIT_A}'`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(B, 'authenticated', () => db.query(`delete from public.logs where habit_id = '${HABIT_A}'`));
    expect(del.affectedRows).toBe(0);
    const still = await db.query<{ name: string }>('select name from public.habits');
    expect(still.rows[0].name).toBe('Workout');
  });

  it("refuses rows written in someone else's name", async () => {
    await expect(
      as(B, 'authenticated', () => db.exec(`insert into public.habits (id, user_id, name, kind) values (gen_random_uuid(), '${A}', 'x', 'build')`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses a log attached to someone else's habit", async () => {
    await expect(
      as(B, 'authenticated', () => db.exec(`insert into public.logs (habit_id, day, status) values ('${HABIT_A}', '2026-09-20', 'done')`)),
    ).rejects.toThrow(/foreign key|row-level security/);
  });

  it('rejects impossible values', async () => {
    await expect(as(A, 'authenticated', () => db.exec(`insert into public.logs (habit_id, day, status) values ('${HABIT_A}', '2026-09-21', 'maybe')`))).rejects.toThrow(/check constraint/);
    await expect(as(A, 'authenticated', () => db.exec(`insert into public.habits (id, name, kind) values (gen_random_uuid(), 'x', 'sometimes')`))).rejects.toThrow(/check constraint/);
  });

  it('lets an upsert overwrite the same day (how the app saves a re-logged habit)', async () => {
    await as(A, 'authenticated', () =>
      db.exec(`insert into public.logs (habit_id, day, status) values ('${HABIT_A}', '2026-09-19', 'done')
               on conflict (habit_id, day) do update set status = excluded.status, reason = null, tags = '{}'`),
    );
    const r = await as(A, 'authenticated', () => db.query('select status, reason from public.logs'));
    expect(r.rows).toEqual([{ status: 'done', reason: null }]);
  });

  it('gives signed-out visitors nothing', async () => {
    await expect(as(null, 'anon', () => db.query('select * from public.habits'))).rejects.toThrow(/permission denied/);
  });

  it('removes a habit\'s logs when the habit is deleted', async () => {
    await db.exec(`delete from public.habits where id = '${HABIT_A}'`);
    const r = await db.query('select count(*)::int as n from public.logs');
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});
