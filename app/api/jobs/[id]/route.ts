import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const baseUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const upstream = await fetch(`${baseUrl}/jobs/${encodeURIComponent(context.params.id)}`, { cache: 'no-store' });
    const result = await upstream.json();
    if (!upstream.ok && result.detail) return NextResponse.json({ error: result.detail }, { status: upstream.status });
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    console.error('Falha ao consultar status na API Python:', error);
    return NextResponse.json({ error: 'Não foi possível consultar o serviço Python.' }, { status: 503 });
  }
}
