import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { SESSION_COOKIE, signSession } from '@/lib/auth';

const req = (body: string, authenticated = true, length?: string) => new Request('https://local.test/api/film-discovery', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { cookie: `${SESSION_COOKIE}=${signSession().token}` } : {}), ...(length ? { 'Content-Length': length } : {}) }, body,
});

beforeEach(() => { vi.stubEnv('PASSWORD', 'fixture-password'); vi.stubEnv('TMDB_READ_ACCESS_TOKEN', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('POST /api/film-discovery', () => {
  it('preserves password and session guards', async () => {
    expect((await POST(req('{}', false))).status).toBe(401);
    vi.stubEnv('PASSWORD', '');
    expect((await POST(req('{}'))).status).toBe(503);
  });
  it('rejects malformed, oversized and invalid typed requests', async () => {
    expect((await POST(req('bad json'))).status).toBe(400);
    expect((await POST(req('{}'))).status).toBe(400);
    expect((await POST(req(' '.repeat(4097)))).status).toBe(413);
    expect((await POST(req('{}', true, '5000'))).status).toBe(413);
  });
  it('returns private no-store unknown fallback and makes no network call without authorization', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await POST(req(JSON.stringify({ title: '影片', mediaType: 'movie' })));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    const result = await response.json();
    expect(result.state).toBe('not_configured'); expect(result.availability).toHaveLength(6);
    expect(result.availability.every((p: { statuses: string[] }) => p.statuses.join() === 'unknown')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
