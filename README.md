# LoopTube

App Tizen Web (TV) que reproduz em loop uma playlist do YouTube em tela cheia, com controle por controle remoto e retomada de progresso.

## Estrutura

- `index.html` — frontend (HTML5 `<video>`).
- `proxy/server.js` — proxy Node.js que resolve streams via `yt-dlp` e expõe a playlist.
- `config.xml` — manifesto do app Tizen (hosted).
- `RELATORIO.md` — análise de features, bugs e melhorias.

## Requisitos

- Node.js 18+
- `yt-dlp` instalado e acessível
- Tizen Studio (para build/empacotamento)
- Chave da YouTube Data API v3

## Configuração do proxy

```bash
cd proxy
cp .env.example .env  # se existir; caso contrário crie manualmente
```

Variáveis de ambiente (`proxy/.env`):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `YT_API_KEY` | sim | Chave da YouTube Data API v3 |
| `PORT` | não | Porta do proxy (default 5000) |
| `YTDLP_BIN` | não | Caminho do yt-dlp (default `yt-dlp`) |
| `EXTRA_PATH` | não | PATH extra para o yt-dlp |
| `YTDLP_COOKIES` | não | Arquivo de cookies do yt-dlp |
| `YTDLP_TIMEOUT_MS` | não | Timeout por execução (default 30000) |
| `CACHE_TTL_MS` | não | TTL do cache de streams (default 300000) |
| `CORS_ORIGINS` | não | Origens permitidas (vírgula) ou `*` |
| `RATE_WINDOW_MS` / `RATE_MAX` | não | Rate limit (default 60000ms / 60) |
| `HTTPS_KEY` / `HTTPS_CERT` | não | Certificados para rodar em HTTPS |

## Executar o proxy

```bash
cd proxy
set -a && . ./.env && set +a
npm install
npm test
node server.js
```

## Build do app Tizen

```bash
tizen build-web -- .
```

Saída em `.buildResult/`.

## Empacotamento (opcional)

Requer perfil de assinatura configurado no Tizen Studio:

```bash
tizen package -t wgt -s <profile> -- .buildResult
```

## Frontend

O frontend usa por padrão um túnel público. Para apontar para outro servidor:

```
https://<host>/index.html?server=https://seu-proxy&playlist=PL...
```

Ou defina `localStorage.looptube_server`.

## Segurança

- Não commite `proxy/.env`.
- Rotacione a chave da YouTube API periodicamente.
- Use HTTPS em produção (via `HTTPS_KEY`/`HTTPS_CERT` ou proxy reverso).
- Para secret managers, use `YT_API_KEY_FILE` em vez de `YT_API_KEY`.

## Deploy com HTTPS estável (Docker + Caddy)

1. Defina `DOMAIN=seu-dominio.com` no ambiente.
2. Configure `proxy/.env`.
3. Execute:

```bash
docker compose up -d --build
```

O Caddy obtém certificado HTTPS automaticamente (Let's Encrypt) e faz proxy para o serviço.
