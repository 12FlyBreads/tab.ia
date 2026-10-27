# Tab IA

MVP acadêmico para enviar áudio, processar em background com Redis e mostrar uma tablatura textual. Não usa banco de dados ou login. O arquivo de entrada fica temporariamente no diretório `uploads/` e é removido pelo worker ao terminar. Os estados/resultados expiram no Redis após uma hora.

## Arquitetura

```text
Browser -> Next.js POST /api/jobs -> uploads/ + Redis list audio_jobs
Browser -> Next.js GET /api/jobs/:id <- Redis job:<id>
                                      ↑
                              Python worker (BLPOP)
                         Demucs -> Basic Pitch -> tab
```

Demucs não tem uma stem específica para guitarra. O MVP usa `--two-stems other` como aproximação (instrumental sem vocais), então outros instrumentos podem gerar notas espúrias. A conversão MIDI usa afinação padrão E A D G B e, para cada nota, seleciona a primeira corda/casa válida até a casa 22; não otimiza digitação nem ritmo. Basic Pitch pode ser sensível a áudio polifônico.

## Pré-requisitos

- Node.js 20 ou superior e npm.
- Python 3.10–3.11 recomendado para compatibilidade das dependências de áudio.
- FFmpeg instalado e disponível no `PATH` (necessário para decodificação e Demucs).
- Docker Desktop (opcional, apenas para Redis).

## Rodar localmente

1. Suba o Redis: `docker compose up -d redis`.
2. Na raiz, copie `.env.example` para `.env.local` se precisar alterar `REDIS_URL` ou `UPLOAD_DIR`.
3. Instale e inicie Next.js:

   ```bash
   npm install
   npm run dev
   ```

4. Em outro terminal, crie o ambiente Python e instale o worker:

   ```bash
   cd worker
   python -m venv .venv
   # Windows PowerShell: .venv\Scripts\Activate.ps1
   # macOS/Linux: source .venv/bin/activate
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   python worker.py
   ```

5. Abra http://localhost:3000, envie um MP3/WAV de até 50 MB. Mantenha Next.js, Redis e worker ativos.

Next.js e worker usam `REDIS_URL=redis://localhost:6379` por padrão. Se alterar a URL no Next, exporte a mesma variável também no shell do worker. A primeira execução do Demucs/Basic Pitch pode baixar modelos e levar alguns minutos. O upload salva no disco local compartilhado; essa configuração é para desenvolvimento em uma máquina, não para deploy com instâncias isoladas/serverless. Em produção, use armazenamento temporário compartilhado ou object storage e limites de tamanho/duração adequados.

## Estrutura

```text
app/                         interface e rotas de API (Next.js App Router)
  api/jobs/route.ts          upload, arquivo temporário e enqueue
  api/jobs/[id]/route.ts     polling do estado/result
worker/worker.py             consumer e pipeline de áudio
docker-compose.yml           Redis local
```
