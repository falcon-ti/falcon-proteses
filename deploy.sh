#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Deploy / atualização do Falcon Próteses (multi-cliente)
#
# Um único checkout de código serve todos os clientes. Cada cliente
# roda como um "app" separado do PM2 (ver ecosystem.config.js), com
# seu próprio .env em /etc/falcon-proteses/<cliente>.env.
#
# Uso:
#   ./deploy.sh          -> atualiza tudo (backend + frontend) e reinicia todos os clientes
#   ./deploy.sh back     -> só backend (código, dependências, pega .env novo de cada cliente)
#   ./deploy.sh front    -> só frontend
# ============================================================

APP_DIR="/var/www/falcon-proteses"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

WHAT="${1:-all}"

log() {
  echo -e "\n\033[1;36m==> $1\033[0m"
}

fail() {
  echo -e "\033[1;31mErro: $1\033[0m" >&2
  exit 1
}

if [[ "$WHAT" != "all" && "$WHAT" != "back" && "$WHAT" != "front" ]]; then
  fail "Uso: ./deploy.sh [all|back|front]"
fi

cd "$APP_DIR" || fail "Não achei $APP_DIR"

log "Buscando alterações do git"
git pull

# ---------------------------------------------
# Backend (todos os clientes compartilham o mesmo código)
# ---------------------------------------------
if [[ "$WHAT" == "all" || "$WHAT" == "back" ]]; then
  log "Instalando dependências do backend"
  cd "$BACKEND_DIR"
  npm install --omit=dev

  # Estrutura do banco: aplica os scripts novos de sql/ na base de CADA
  # cliente (um .env por cliente em /etc/falcon-proteses/).
  for ENV in /etc/falcon-proteses/*.env; do
    [[ -f "$ENV" ]] || continue
    log "Migrando banco ($(basename "$ENV" .env))"
    ENV_FILE="$ENV" node scripts/migrar.js
  done

  log "Reiniciando todos os clientes no PM2 (pega .env novo de cada um também)"
  pm2 restart ecosystem.config.js --update-env

  cd "$APP_DIR"
fi

# ---------------------------------------------
# Frontend (build único, compartilhado entre clientes)
# ---------------------------------------------
if [[ "$WHAT" == "all" || "$WHAT" == "front" ]]; then
  log "Instalando dependências do frontend"
  cd "$FRONTEND_DIR"
  npm install

  log "Gerando build de produção"
  npm run build

  cd "$APP_DIR"
fi

log "Status atual do PM2"
pm2 status

log "Deploy concluído com sucesso"
