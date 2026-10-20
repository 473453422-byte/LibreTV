import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { discoverFilm, parseFilmRequest } from '@/lib/film-discovery-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  let body: unknown;
  // The UI sends a small title/type/version object, never a source URL or credential.
  if (Number(req.headers.get('content-length')) > 4096) return NextResponse.json({ error: '请求内容过长' }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return NextResponse.json({ error: '请求内容过长' }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: '请求格式错误' }, { status: 400 }); }
  const request = parseFilmRequest(body);
  if (!request) return NextResponse.json({ error: '影片名称、类型或版本无效' }, { status: 400 });
  return NextResponse.json(await discoverFilm(request), { headers: { 'Cache-Control': 'private, no-store' } });
}
