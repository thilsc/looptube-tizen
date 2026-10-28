# Relatório de Análise — LoopTube

> Gerado automaticamente a partir da análise do repositório.

## Visão geral

O repositório é um app **Tizen Web (TV)**, "LoopTube", que reproduz em loop uma playlist do YouTube em tela cheia, com controle por controle remoto. Existem **duas implementações convivendo**:

1. **Versão atual (working tree, não commitada)** em `index.html`: usa `<video>` HTML5 e um **proxy Node.js** (`proxy/server.js`) que resolve URLs de stream via `yt-dlp`, com progresso salvo em `localStorage`.
2. **Versão anterior (HEAD)** em `index.html` + `js/youtube_iframe_api.js` + `js/adblock.js`: usava a **YouTube IFrame Player API** e injeção de adblock.

O proxy e os arquivos em `js/` estão **não rastreados/legados**, o que torna a base inconsistente.

---

## Features identificadas

### Ativas (versão atual)

- Reprodução em loop de playlist YouTube (via proxy → `<video>`).
- Navegação por controle remoto Tizen/teclado: Play/Pause, próximo/anterior, Voltar (exit).
- Persistência de progresso: `index` + `time` em `localStorage` (`STORAGE_KEY`).
- Retomada automática do último ponto ao abrir.
- Fallback de clientes no proxy: `android`, `ios`, `mweb`, `web`.
- Paginação automática da playlist (YouTube Data API, 50 por página).
- Registro de teclas de mídia no Tizen.
- Autoplay com `playsinline`.

### Legadas / não integradas

- `js/youtube_iframe_api.js`: player iframe com playlist, `loop`, qualidade `hd1080`, adblock DOM.
- `js/adblock.js`: interceptação de `fetch`, remoção de nós de anúncio e CSS anti-ads.
- `js/iframe_api.js`: bootstrap do widget API do YouTube (versão fixa de player).
- `css/style.css`: regras para `#player iframe` (não referenciado na `index.html` atual).

---

## Bugs encontrados

### Críticos / funcionais

1. **Seek antes de carregar metadados** (`index.html`, `playAt`):
   ```js
   video.src = urls[currentIndex];
   video.currentTime = startTime; // pode ser ignorado se metadados não carregaram
   ```
   Em vários navegadores/TVs o `currentTime` setado antes de `loadedmetadata` é descartado → retomada não funciona.

2. **Retomada inconsistente de progresso**: `loadProgress()` usa `index`, mas não valida `time` nem se o vídeo ainda existe; `progress.index < urls.length` não garante índice válido após mudanças de playlist.

3. **Loop infinito em falhas**: `error` sempre avança para o próximo após 1s. Se todos os vídeos falharem (ex.: proxy offline), gera ciclo infinito de requisições.

4. **Proxy dependente de ambiente de dev**: `--cookies-from-browser firefox` e `EXTRA_PATH` apontando para `/home/thiago/.nvm/...`. Em produção/TV host não existe Firefox/perfil → falha total.

5. **URL do servidor hardcoded e efêmera**:
   ```js
   const SERVER = 'https://investors-kilometers-alumni-aims.trycloudflare.com';
   ```
   Túneis Cloudflare mudam; app quebra sem rebuild.

6. **Mixed content / HTTPS**: página hospedada em HTTPS, mas `config.xml` libera `http://192.168.18.8:5000`. Proxy local HTTP não será acessível de página HTTPS; apenas o túnel HTTPS funciona.

7. **`ended` remove progresso e chama `playAt` sem aguardar**: troca de `src` sem limpar estado pode manter `currentTime` antigo em alguns players.

8. **Duplo tratamento do botão Voltar**: `keydown` (code 10009) e `tizenhwkey` podem executar `exit()` duas vezes.

9. **Intervalo não limpo**: `setInterval(saveProgress, 5000)` nunca é cancelado (nem em `beforeunload` na versão atual).

10. **`playAt` com módulo de negativo**: `((index % urls.length) + urls.length) % urls.length` funciona, mas `currentIndex` é atualizado mesmo se `play()` falhar.

### Proxy (`server.js`)

11. **Latência alta**: cada `/proxy/:id` executa `yt-dlp` (até 30s × 4 clientes = até 2 min) antes de redirecionar. Vídeo pode demorar muito para iniciar.
12. **Sem cache de URLs resolvidas**: requisições repetidas reexecutam yt-dlp.
13. **Sem validação/sanitização do `id`**: usado diretamente na URL do YouTube. Risco de injeção/SSRF indireta via yt-dlp.
14. **CORS aberto (`cors()`)** sem origem restrita.
15. **Sem rate limit / helmet / tratamento de erros centralizado**.
16. **Chave de API em `.env` não ignorado explicitamente** (proxy é untracked, mas `.env` pode ser commitado por engano).
17. **`node-fetch` v2 + Express 5**: combinação funcional, mas sem timeout global nas chamadas à YouTube API.
18. **Redirecionamento para URL temporária** do Google Video, que pode expirar no meio da reprodução → erro de rede.

### Legado (iframe)

19. **`onStateChange` ENDED chama `playVideo()`** em vez de `nextVideo()`; com `loop: 1`, pode repetir o mesmo vídeo em vez de avançar playlist (depende do player).
20. **`js/iframe_api.js` fixa versão de player** (`5e4f1adf`) possivelmente desatualizada.
21. **Adblock por DOM pode remover nós legítimos** que casem com seletores.
22. **Estilos duplicados** (`style` e `style2`) com regras redundantes.

---

## Gaps (ausências)

- Sem `README.md`, documentação de setup/deploy.
- Sem testes (unitários/integração) e sem CI.
- Sem `package.json` na raiz; dependências apenas em `proxy/`.
- Sem configuração de build/deploy do app Tizen automatizada.
- Sem UI de carregamento/erro/volume/qualidade.
- Sem controle de volume/legendas.
- Sem telemetria/logging estruturado.
- Sem tratamento de cotas da YouTube API (erro 403/quotaExceeded).
- Sem fallback offline.
- `css/style.css` não utilizado na versão atual.
- `config.xml` aponta para GitHub Pages antigo e não reflete o novo index.
- Sem estratégia de atualização de app (versão fixa 1.0.0).

---

## Pontos de melhoria

### Arquitetura

- **Unificar implementação**: remover código morto (`adblock.js`, `youtube_iframe_api.js`, `iframe_api.js`) ou reintegrá-los de forma explícita.
- **Externalizar configuração**: `SERVER`, `PLAYLIST`, qualidade e volume via settings/localStorage, não hardcoded.
- **Descoberta dinâmica do proxy**: evitar túnel efêmero (domínio estável + HTTPS).
- **Cache de stream URLs** com TTL e invalidação.
- **Retry com backoff** e skip após N falhas consecutivas.

### Frontend

- Aguardar `loadedmetadata` antes de `seekTo`/`currentTime`.
- Limpar `setInterval` e listeners ao sair.
- Adicionar tela de loading/erro e botão de retry.
- Prevenir comportamento padrão de todas as teclas de mídia.
- Validar progresso carregado (tipos, ranges).
- Usar `video.preload = 'metadata'` e `crossOrigin` se necessário.

### Backend (proxy)

- Validar `id` (regex `^[a-zA-Z0-9_-]{11}$`).
- Usar arquivo de cookies do yt-dlp em vez de `--cookies-from-browser`.
- Parametrizar `YTDLP_BIN`, `EXTRA_PATH`, porta via env.
- Adicionar `helmet`, rate limit, logs estruturados, graceful shutdown.
- Cache em memória (LRU) para URLs de stream.
- Healthcheck endpoint.
- HTTPS ou rodar atrás de proxy reverso.
- Remover segredo do `.env` do repositório (`.gitignore`).

### Qualidade

- Adicionar ESLint/Prettier, testes (Jest/Vitest), CI.
- Documentar setup (README) e variáveis de ambiente.
- Versionamento semântico e changelog.

---

## Segurança

- **Chave da YouTube API exposta** em `proxy/.env` (mesmo não rastreado, risco de commit acidental). Rotacionar e usar secret manager.
- **CORS `*`** no proxy.
- **Sem autenticação** no proxy (qualquer cliente pode consumir quota).
- **`access origin="*"`** no `config.xml`.
- **Túnel público** expõe o proxy sem controle de acesso.

---

## Recomendações priorizadas

1. Corrigir seek após `loadedmetadata` e validação de progresso. (resolvido)
2. Estabilizar proxy (domínio HTTPS, cookies file, cache, validação de id). (parcial)
3. Remover código morto ou reativá-lo de forma explícita. (resolvido)
4. Adicionar `.gitignore` para `.env` e rotacionar chave. (parcial - .gitignore ok; rotação externa)
5. Documentar setup e adicionar testes mínimos. (pendente)
6. Implementar retry/backoff e UI de erro. (resolvido)

---

## Status das correções (reanálise)

### Resolvidos

- Seek antes de `loadedmetadata` (agora aguarda evento).
- Validação de progresso (índice/tempo).
- Loop infinito em falhas (limite de erros consecutivos).
- Duplo tratamento do botão Voltar (guard `exiting`).
- Intervalo de save não limpo (clearInterval no beforeunload).
- Cache de URLs de stream no proxy.
- Validação de `id` no proxy.
- Código morto (adblock/iframe) removido.
- `.gitignore` atualizado para `.env`.
- Retry/backoff na carga da playlist + UI de status.
- CORS configurável e cabeçalhos básicos de segurança.
- Rate limit simples no proxy.
- Remoção do origin HTTP inseguro no `config.xml`.

### Parciais

- URL do servidor ainda tem default efêmero (override via query/localStorage).
- Dependência de ambiente dev no proxy (cookies optional; EXTRA_PATH ainda default dev).
- CORS ainda `*` por default.
- Chave da API ainda em `.env` (rotação é ação externa).

### Pendentes

- Mixed content/HTTPS definitivo (domínio estável).
- Rate limit robusto / helmet.
- Testes e documentação (README, CI).
- Empacotamento/versão do app.
- Expiração de URLs temporárias do Google Video (inherent).