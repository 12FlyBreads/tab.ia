# Tab IA

MVP acadêmico para enviar um áudio, processá-lo em segundo plano e exibir uma tablatura textual. Não usa banco de dados, login, Redis ou Docker. Os estados e resultados dos jobs ficam em um dicionário Python em RAM e desaparecem quando o processo da API é encerrado.

## Arquitetura local

```text
Browser -> Next.js POST /api/jobs -> FastAPI POST /jobs
Browser -> Next.js GET /api/jobs/:id <- FastAPI GET /jobs/:id
                                          |
                                  BackgroundTasks
                              Demucs -> Basic Pitch -> tab
                                          |
                                  jobs (dicionário RAM)
```

O pipeline usa o modelo experimental `htdemucs_6s` e a stem `guitar` para tentar isolar guitarra/violão antes da inferência. Essa stem pode conter vazamento de outros sons e o resultado depende do arranjo e da qualidade do áudio. A conversão MIDI usa afinação padrão E A D G B e, para cada nota, seleciona a primeira corda/casa válida até a casa 22; não otimiza digitação nem ritmo. Basic Pitch pode ser sensível a áudio polifônico.

O worker mantém a stem WAV para a inferência e cria uma prévia MP3 temporária para o player. A rota da prévia suporta requisições HTTP por intervalo (`Range`) para carregamento progressivo e busca no áudio.

## Pré-requisitos

- Node.js 20 ou superior e npm.
- Python 3.10 recomendado para compatibilidade das dependências de áudio. Use essa versão para criar o ambiente virtual; Python 3.14 não é compatível com o TensorFlow exigido pelo Basic Pitch.
- FFmpeg instalado e disponível no `PATH` (necessário para decodificação e Demucs).

No Windows, você pode instalar o FFmpeg pelo WinGet: `winget install --id Gyan.FFmpeg.Shared --exact`. Depois, abra um terminal novo e confirme com `ffmpeg -version`.

## Rodar localmente

1. Abra o terminal na raiz do projeto, na pasta que contém `package.json`. Copie `.env.example` para `.env.local` somente se quiser alterar o endereço da API Python. O padrão é `http://127.0.0.1:8000`.
2. Em um terminal, instale e inicie o Next.js:

   ```bash
   npm install
   npm run dev
   ```

3. Abra um segundo terminal também na raiz do projeto. No PowerShell, execute:

   ```powershell
   Set-Location .\worker
   py -3.10 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python --version
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
   ```

   Confirme que `python --version` mostra `Python 3.10.x`. Esses comandos criam o ambiente em `worker/.venv`; execute `Set-Location .\worker` apenas uma vez, partindo da raiz do projeto. No macOS/Linux, use `python3.10 -m venv .venv` e `source .venv/bin/activate` no lugar dos comandos de criação e ativação do PowerShell.

4. Abra http://localhost:3000 e envie um MP3/WAV de até 50 MB. Mantenha Next.js e FastAPI ativos enquanto o job é processado.

A primeira execução pode baixar modelos do Demucs/Basic Pitch e levar alguns minutos. Para este MVP, rode apenas um processo Uvicorn: cada processo teria seu próprio dicionário de jobs, e requisições distribuídas entre processos não encontrariam necessariamente o job correspondente. Reiniciar a API apaga os jobs da memória. O instrumental fica em arquivo temporário durante a sessão; ao recarregar a página, o job é descartado e esse arquivo removido. Jobs concluídos também expiram após uma hora como proteção adicional.

## Estrutura

```text
app/                         interface e rotas de proxy Next.js
  api/jobs/route.ts          encaminha upload para FastAPI
  api/jobs/[id]/route.ts     encaminha consulta de status para FastAPI
worker/api.py                endpoints FastAPI e recebimento de uploads
worker/jobs.py               estado em memória e expiração dos jobs
worker/pipeline/workflow.py  orquestração das etapas de processamento
worker/pipeline/separation/  stem de guitarra, prévia MP3 e entrega com Range
worker/pipeline/inference/   inferência de áudio para MIDI com Basic Pitch
worker/pipeline/tablature/   posicionamento de notas e renderização da tablatura
worker/requirements.txt      dependências Python
```
