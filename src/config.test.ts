// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudFromEnv } from './lib/cloud';

const env = (url?: string, key?: string) => {
  vi.stubEnv('VITE_SUPABASE_URL', url ?? '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key ?? '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
};
afterEach(() => vi.unstubAllEnvs());

describe('reading .env.local', () => {
  it('runs on this device only when nothing is set', () => {
    env();
    expect(cloudFromEnv()).toBeNull();
  });
  it('uses your project when the URL and key are set, and drops a pasted path', () => {
    env('https://abcdefgh.supabase.co/rest/v1/', 'sb_publishable_real');
    expect(cloudFromEnv()?.label).toBe('supabase');
  });
  it('still accepts the older anon key name', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefgh.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJlegacy');
    expect(cloudFromEnv()?.label).toBe('supabase');
  });
  it('says what is wrong instead of failing silently', () => {
    env('https://abcdefgh.supabase.co', '');
    expect(() => cloudFromEnv()).toThrow(/key is missing/);
    env('', 'sb_publishable_real');
    expect(() => cloudFromEnv()).toThrow(/URL is missing/);
    env('not a url', 'sb_publishable_real');
    expect(() => cloudFromEnv()).toThrow(/not a valid web address/);
    env('https://YOUR-PROJECT.supabase.co', 'sb_publishable_xxxxxxxxxxxxxxxx');
    expect(() => cloudFromEnv()).toThrow(/placeholder/);
  });
  it('offers the demo cloud on request', () => {
    env('demo');
    expect(cloudFromEnv()?.label).toBe('demo');
  });
});
