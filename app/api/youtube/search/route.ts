import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 200) {
    return NextResponse.json({ error: 'Digite ao menos 2 caracteres para pesquisar.' }, { status: 400 });
  }

  try {
    const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const upstream = await fetch(`${baseUrl}/youtube/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    const result = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: result.detail || 'Falha ao pesquisar no YouTube.' }, { status: upstream.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Falha ao pesquisar no YouTube:', error);
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço Python.' }, { status: 503 });
  }
}
