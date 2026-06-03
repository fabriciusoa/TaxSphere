#!/usr/bin/env bash
# Bootstrap do Vault dev para o TaxSphere.
#
# Após o vault subir (docker compose up -d), este script:
#   1. Habilita o engine Transit (encryption-as-a-service).
#   2. Cria a chave Transit "taxsphere-cert" (AES-256-GCM96 c/ key derivation).
#   3. Cria a policy "taxsphere-cert-policy" — só permite encrypt/decrypt nessa chave.
#   4. Habilita o auth method AppRole.
#   5. Cria o role "taxsphere-backend" amarrado à policy acima.
#   6. Imprime role_id + secret_id pra colar no .env do backend.
#
# Idempotente — pode rodar várias vezes.
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-dev-root-token-only-for-local}"
KEY_NAME="${VAULT_TRANSIT_KEY:-taxsphere-cert}"
POLICY_NAME="taxsphere-cert-policy"
APPROLE_NAME="taxsphere-backend"

export VAULT_ADDR VAULT_TOKEN

vault() {
  docker exec -e VAULT_ADDR -e VAULT_TOKEN taxsphere-vault-dev vault "$@"
}

echo "▸ Habilitando Transit engine"
vault secrets enable -path=transit transit 2>/dev/null || echo "  já habilitado"

echo "▸ Criando chave Transit '$KEY_NAME' (AES-256-GCM96)"
vault write -f "transit/keys/$KEY_NAME" type=aes256-gcm96 derived=false 2>/dev/null || echo "  já existe"

echo "▸ Criando policy '$POLICY_NAME'"
cat <<EOF | docker exec -i -e VAULT_ADDR -e VAULT_TOKEN taxsphere-vault-dev vault policy write "$POLICY_NAME" -
path "transit/encrypt/$KEY_NAME" {
  capabilities = ["update"]
}
path "transit/decrypt/$KEY_NAME" {
  capabilities = ["update"]
}
# Rotate key (admin/manual em produção; ok deixar pra app girar via cron interno)
path "transit/keys/$KEY_NAME/rotate" {
  capabilities = ["update"]
}
EOF

echo "▸ Habilitando auth/approle"
vault auth enable approle 2>/dev/null || echo "  já habilitado"

echo "▸ Criando AppRole '$APPROLE_NAME' (TTL 24h, max 720h)"
vault write "auth/approle/role/$APPROLE_NAME" \
  token_policies="$POLICY_NAME" \
  token_ttl=24h \
  token_max_ttl=720h \
  secret_id_ttl=0 \
  secret_id_num_uses=0

ROLE_ID=$(vault read -field=role_id "auth/approle/role/$APPROLE_NAME/role-id")
SECRET_ID=$(vault write -f -field=secret_id "auth/approle/role/$APPROLE_NAME/secret-id")

cat <<EOF

════════════════════════════════════════════════════════════════════
 Bootstrap concluído.
 Cole no web/backend/.env:

VAULT_ENABLED=true
VAULT_ADDR=$VAULT_ADDR
VAULT_TRANSIT_KEY=$KEY_NAME
VAULT_ROLE_ID=$ROLE_ID
VAULT_SECRET_ID=$SECRET_ID
VAULT_FALLBACK_AES=true   # em DEV; em PROD deixe false

Depois reinicie o backend e rode o migration:
  cd web/backend
  node scripts/migrarCertsParaVault.mjs           # dry-run
  APPLY=true node scripts/migrarCertsParaVault.mjs # aplica

════════════════════════════════════════════════════════════════════
EOF
