# Vault para TaxSphere

Camada de **encryption-as-a-service** para os certificados digitais (.pfx + senhas).
A chave-mestra fica no Vault; o backend só manda plaintext e recebe ciphertext.

## Por que Vault em vez de continuar com AES local

| Aspecto | AES local (estado anterior) | Vault Transit |
|---|---|---|
| Chave-mestra | Em `CERT_ENCRYPTION_KEY`/`JWT_SECRET` no `.env` do servidor | Dentro do Vault, nunca exposta |
| Auditoria de cada uso do segredo | Não há | Vault audit log com timestamp + identidade |
| Rotação de chave | Manual + re-encrypt manual de tudo | `vault write -f transit/keys/<k>/rotate` mantém versões antigas |
| Acesso revogável | Não (precisa trocar env + redeploy) | Revogar AppRole = corta acesso instantâneo |
| Separação de papéis | Mesma máquina/processo dono dos dados é dona da chave | Quem acessa a app não precisa ver a chave |
| Fail-closed | Não aplicável | Configurável (`VAULT_FALLBACK_AES=false` em prod) |

## Setup local (dev)

```bash
# 1. Sobe Vault em modo dev (dados em memória, root token fixo)
docker compose -f infra/vault/docker-compose.yml up -d

# 2. Cria Transit + policy + AppRole — imprime VAULT_ROLE_ID e VAULT_SECRET_ID
bash infra/vault/bootstrap.sh
```

Cole as variáveis no `web/backend/.env`:

```env
VAULT_ENABLED=true
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TRANSIT_KEY=taxsphere-cert
VAULT_ROLE_ID=<vindo do bootstrap>
VAULT_SECRET_ID=<vindo do bootstrap>
VAULT_FALLBACK_AES=true   # SÓ EM DEV — em prod deixe false
```

Reinicie o backend e rode o migration:

```bash
cd web/backend
node scripts/migrarCertsParaVault.mjs              # dry-run (mostra plano)
APPLY=true node scripts/migrarCertsParaVault.mjs   # grava no banco
```

## Setup de produção (checklist mínima)

1. **Não use o dev mode.** Suba Vault em modo prod com storage Raft (3+ nós).
2. **Auto-unseal** via AWS KMS, GCP KMS, Azure Key Vault ou HSM. Sem isso, cada restart precisa de operador.
3. **TLS obrigatório.** Sem `VAULT_TLS_SKIP_VERIFY=true`.
4. **Audit log** habilitado: `vault audit enable file file_path=/vault/logs/audit.log`.
5. **Backup automático do snapshot Raft** + teste de restore.
6. **Rotação programada** da chave Transit (cron ou Vault `min_version`/`auto-rotate-period`).
7. **AppRole de produção** com `secret_id_ttl` e `secret_id_num_uses` limitados; girar via serviço de delivery (não no `.env`).
8. `VAULT_FALLBACK_AES=false` — falha fechada se Vault cair, melhor indisponibilidade do que vazamento.

## Como o app usa

| Operação | Antes | Agora |
|---|---|---|
| Upload de cert | `pfx_encrypted = AES(pfx); iv = hex` | Mesmo formato OU `pfx_encrypted = "vault:v1:..."; iv = "__VAULT__"` |
| Decifra | `AES.decrypt(pfx, iv)` | Detecta `iv === __VAULT__` → `vaultDecrypt(blob)`; senão AES legado |
| Senha do cert | `"iv:cipher"` | Mesmo OU `"vault:v1:..."` |

Coexistência: rows antigas (AES) continuam funcionando; novas vão pro Vault. O script de migração re-encripta as antigas no Vault e marca `iv='__VAULT__'`.

## Rollback de emergência

Se algo der errado em produção:

```env
VAULT_ENABLED=false
```

Restart. O `decrypt` cai pra AES local — **só funciona para rows ainda em AES**. Para reverter rows já migradas, restaure do `scripts/.cert-backup-<ts>.json` gerado pelo migrator.

## Verificação rápida

```bash
# Vault saudável?
curl http://localhost:8200/v1/sys/health

# Backend conectou no Vault?
curl -s http://localhost:3000/api/health/full -H "Cookie: token=<admin>" | jq .vault
```
