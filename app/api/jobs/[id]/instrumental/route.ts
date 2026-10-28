import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const range = request.headers.get('range');
    const upstream = await fetch(`${baseUrl}/jobs/${encodeURIComponent(context.params.id)}/instrumental`, {
      cache: 'no-store',
      headers: range ? { Range: range } : undefined,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || (upstream.ok ? 'audio/mpeg' : 'application/json'),
        'Content-Disposition': upstream.headers.get('content-disposition') || 'inline; filename="guitarra.mp3"',
        'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
        'Cache-Control': upstream.headers.get('cache-control') || 'no-store',
        ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range')! } : {}),
        ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
      },
    });
  } catch (error) {
    console.error('Falha ao obter instrumental na API Python:', error);
    return NextResponse.json({ error: 'Não foi possível acessar o áudio instrumental.' }, { status: 503 });
  }
}
