#!/bin/sh
set -eu

DOMAIN="fetch-tube.com"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

# If no real cert yet, generate a temporary self-signed one so nginx can start.
# certbot-init.sh will replace this with a real Let's Encrypt cert.
if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
  echo "[nginx-init] No certificate found — generating temporary self-signed cert"
  mkdir -p "${CERT_DIR}"
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}" 2>/dev/null
  echo "[nginx-init] Self-signed cert created. Run scripts/certbot-init.sh to get a real cert."
fi

exec nginx -g "daemon off;"
