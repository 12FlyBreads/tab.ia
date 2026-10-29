import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const source = data.get('youtube_source');
    if (typeof source !== 'string' || !source.trim()) {
      return NextResponse.json({ error: 'Selecione um vídeo do YouTube.' }, { status: 400 });
    }
    const body = new FormData();
    body.append('youtube_source', source.trim());
    const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const upstream = await fetch(`${baseUrl}/youtube/previews`, { method: 'POST', body, cache: 'no-store' });
    const result = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: result.detail || 'Não foi possível preparar a prévia.' }, { status: upstream.status });
    return NextResponse.json({ ...result, audio_url: `/api/youtube/preview/${result.id}` });
  } catch (error) {
    console.error('Falha ao preparar prévia do YouTube:', error);
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço Python.' }, { status: 503 });
  }
}
