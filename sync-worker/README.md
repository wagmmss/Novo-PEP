# Novo-PEP Cloud Sync (Cloudflare Worker + KV)

Micro-backend gratuito (~30 ms, sem cold start) para sincronizar o estado do `Novo-PEP` entre dispositivos usando **apenas 1 senha simples**, sem e-mail nem cadastro.

## Setup único (4 comandos)

Dentro da pasta `sync-worker/`:

```bash
# 1. Entrar na sua conta Cloudflare
npx wrangler login

# 2. Criar o namespace KV (copie o "id" gerado e cole em wrangler.toml)
npx wrangler kv namespace create PEP_SYNC_KV

# 3. Definir a senha simples que você vai digitar no Novo-PEP (fica salva como segredo na Cloudflare)
npx wrangler secret put SYNC_PASSWORD

# 4. Publicar o Worker (copie a URL https://novo-pep-sync.<seu-subdominio>.workers.dev)
npx wrangler deploy
```

## Opcional: não precisar digitar a URL em aparelhos novos

Se quiser que qualquer aparelho (celular, PC de casa ou hospital) peça **só a senha** (sem precisar colar a URL do Worker):

1. No repositório do GitHub (`Settings → Secrets and variables → Actions → Variables`), crie a variável `VITE_SYNC_URL` com a URL do seu Worker (ex.: `https://novo-pep-sync.seuusuario.workers.dev`). A URL não é segredo — o acesso é protegido pela `SYNC_PASSWORD`.
2. O workflow `.github/workflows/deploy.yml` passa `VITE_SYNC_URL` no build do GitHub Pages automaticamente.

## Segurança implementada
- Senha comparada em tempo constante via SHA-256 (nunca aparece no frontend).
- Rate limit de 8 tentativas incorretas por IP a cada 15 minutos (`429`).
- Controle de revisão (`baseRevision` / `409 Conflict`) para impedir que uma aba antiga sobrescreva dados mais recentes de outro aparelho.
- CORS restrito a `https://wagmmss.github.io` (e `localhost`).
