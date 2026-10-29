import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
  try {
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range) headers.set('range', range);
    const upstream = await fetch(`${baseUrl}/youtube/previews/${encodeURIComponent(params.id)}`, { headers, cache: 'no-store' });
    if (!upstream.ok) return NextResponse.json({ error: 'Prévia do YouTube inexistente ou expirada.' }, { status: upstream.status });
    const responseHeaders = new Headers({ 'content-type': upstream.headers.get('content-type') || 'audio/mpeg' });
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('Falha ao servir prévia do YouTube:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a prévia do YouTube.' }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
  try {
    const upstream = await fetch(`${baseUrl}/youtube/previews/${encodeURIComponent(params.id)}`, { method: 'DELETE', cache: 'no-store' });
    return new Response(null, { status: upstream.status });
  } catch (error) {
    console.error('Falha ao descartar prévia do YouTube:', error);
    return new Response(null, { status: 503 });
  }
}
