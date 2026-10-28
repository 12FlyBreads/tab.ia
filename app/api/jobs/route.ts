import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Envie um arquivo de áudio.' }, { status: 400 });
    const body = new FormData();
    body.append('file', file, file.name);
    const startSeconds = data.get('start_seconds');
    const endSeconds = data.get('end_seconds');
    if (typeof startSeconds === 'string') body.append('start_seconds', startSeconds);
    if (typeof endSeconds === 'string') body.append('end_seconds', endSeconds);
    const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const upstream = await fetch(`${baseUrl}/jobs`, { method: 'POST', body, cache: 'no-store' });
    const result = await upstream.json();
    if (!upstream.ok && result.detail) return NextResponse.json({ error: result.detail }, { status: upstream.status });
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    console.error('Falha ao encaminhar job para o serviço Python:', error);
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço Python. Verifique se a API está ativa.' }, { status: 503 });
  }
}
