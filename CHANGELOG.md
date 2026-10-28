# Changelog

## 1.1.0

- Busca/retomada de progresso mais robusta (seek após `loadedmetadata`).
- Retry/backoff na carga da playlist e fallback global em falhas.
- Proxy com cache de streams, validação de IDs, rate limit e suporte a HTTPS.
- Remoção de código morto (adblock/iframe).
- Testes automatizados (validadores + integração) e CI.
- Deploy via Docker + Caddy (HTTPS).
- Documentação (README) e relatório de análise.
