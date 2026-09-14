#!/usr/bin/env bash
# One-time script to obtain a Let's Encrypt certificate.
# Run this on the server after the stack is up for the first time.
#
# Usage: bash scripts/certbot-init.sh your@email.com
set -euo pipefail

EMAIL="${1:-}"
DOMAIN="fetch-tube.com"
COMPOSE="docker compose -f docker-compose-production.yml"

if [ -z "$EMAIL" ]; then
  echo "Usage: $0 your@email.com"
  exit 1
fi

echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"

$COMPOSE run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  --cert-name "$DOMAIN" \
  -d "$DOMAIN"

echo "==> Certificate issued. Reloading nginx..."
$COMPOSE exec nginx nginx -s reload

echo "==> Done! https://${DOMAIN} is live."
