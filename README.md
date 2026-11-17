# Tab IA

MVP acadêmico para enviar um áudio, processá-lo em segundo plano e exibir uma tablatura textual. Não usa banco de dados, login, Redis ou Docker. Os estados e resultados dos jobs ficam em um dicionário Python em RAM e desaparecem quando o processo da API é encerrado.

## Arquitetura local

```text
Browser -> Next.js POST /api/jobs -> FastAPI POST /jobs
Browser -> Next.js GET /api/jobs/:id <- FastAPI GET /jobs/:id
                                          |
                                  BackgroundTasks
                                  Demucs -> danmor/guitab -> AlphaTex
                                          |
                                  jobs (dicionário RAM)
```

O pipeline usa o modelo experimental `htdemucs_6s` e a stem `guitar` para tentar isolar guitarra/violão. O worker usa a biblioteca oficial Guitab para obter diretamente os eventos de onset, corda e casa do checkpoint E25 hospedado em `danmor/guitab`; depois quantiza em semicolcheias e monta AlphaTex. A stem pode conter vazamento de outros sons e a qualidade depende do modelo e do arranjo. Os pesos do Guitab estão sob licença CC BY-NC-SA 4.0 (uso não comercial).

O worker mantém `/temp/<job_id>_guitar.wav` e `/temp/<job_id>.tex`, além de criar uma prévia MP3 para o player. A rota da prévia suporta requisições HTTP por intervalo (`Range`) para carregamento progressivo e busca no áudio. O resultado de status contém o AlphaTex em `alpha_tex` e `tab`.

## Pré-requisitos

- Node.js 20 ou superior e npm.
- Python 3.11 ou superior (exigido pela biblioteca oficial Guitab).
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
   py -3.11 -m venv .venv-guitab
   .\.venv-guitab\Scripts\Activate.ps1
   python --version
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
   ```

   Confirme que `python --version` mostra `Python 3.11` ou superior. Esses comandos criam o ambiente em `worker/.venv-guitab`; execute `Set-Location .\worker` apenas uma vez, partindo da raiz do projeto. No macOS/Linux, use `python3.11 -m venv .venv-guitab` e `source .venv-guitab/bin/activate` no lugar dos comandos de criação e ativação do PowerShell.

4. Abra http://localhost:3000 e envie um MP3/WAV de até 50 MB. Mantenha Next.js e FastAPI ativos enquanto o job é processado.

Antes de gerar a tablatura, o player permite ouvir o upload completo. Arraste os dois marcadores da linha de seleção para delimitar um trecho e use “Ouvir trecho selecionado” para conferi-lo; ao enviar, somente esse intervalo será recortado e passado ao Demucs.

Depois de iniciar a interface, o botão de menu abre as configurações de extração de notas do DanmoN/Guitab. Os ajustes são salvos no navegador e aplicados ao próximo processamento; “Restaurar padrões” recupera os valores de decodificação do checkpoint E25.

A primeira execução baixa os modelos do Demucs e o checkpoint E25 do Hugging Face. A biblioteca Guitab do autor é instalada pelo GitHub no `requirements.txt`; não é um modelo `transformers`, por isso não usa `AutoModelForAudioClassification`. Para este MVP, rode apenas um processo Uvicorn: cada processo teria seu próprio dicionário de jobs. Reiniciar a API apaga os jobs da memória e limpa a pasta `temp/`; ao iniciar, ela remove possíveis sobras de uma execução anterior. Uploads e saídas intermediárias do Demucs são apagados ao terminar cada job; artefatos e prévia permanecem até o descarte/reload ou expiração do job.

## Estrutura

```text
app/                         interface e rotas de proxy Next.js
  api/jobs/route.ts          encaminha upload para FastAPI
  api/jobs/[id]/route.ts     encaminha consulta de status para FastAPI
worker/api/                  aplicação FastAPI e rotas HTTP de jobs
worker/core/                 configuração e estado em memória dos jobs
worker/utils/                diretórios temporários e wrappers FFmpeg
worker/pipeline/orchestrator.py coordenação das etapas e atualização dos jobs
worker/pipeline/steps/         recorte, separação Demucs, transcrição corda/casa e geração AlphaTex
app/hooks/                   estado de jobs, polling e prévia local de áudio
app/components/              upload, player instrumental e visualizador de tablatura
worker/requirements.txt      dependências Python
```

## Entrada pelo YouTube

Na tela de envio, escolha **YouTube** para colar um link ou pesquisar pelo nome do vídeo. Na busca, o primeiro resultado é usado. O worker baixa o áudio com `yt-dlp`, converte para MP3 usando FFmpeg e então executa as mesmas etapas de separação, transcrição e geração de tablatura. O download limita vídeos a menos de 20 minutos e 50 MB; a busca e os links do YouTube exigem conexão com a internet no ambiente do worker. Instale a nova dependência ao atualizar o ambiente: `python -m pip install -r requirements.txt`.
