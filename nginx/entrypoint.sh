#!/bin/sh
set -eu

DOMAIN="fetch-tube.com"
LIVE="/etc/letsencrypt/live"
EXPECTED="${LIVE}/${DOMAIN}"

# Find the newest certbot-managed cert for this domain.
# Certbot may have created fetch-tube.com-0001, fetch-tube.com-0002, etc.
# because our self-signed placeholder occupied the base directory first.
CERTBOT_DIR=""
for dir in "${EXPECTED}" "${EXPECTED}"-*; do
  [ -d "$dir" ] || continue
  name="${dir##*/}"
  if [ -f "${dir}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/renewal/${name}.conf" ]; then
    CERTBOT_DIR="$dir"   # keep iterating — last match is the most recent
  fi
done

if [ -n "$CERTBOT_DIR" ] && [ "$CERTBOT_DIR" != "$EXPECTED" ]; then
  # Real cert is at a suffixed path — replace placeholder dir with a symlink
  echo "[nginx-init] Linking ${EXPECTED} -> ${CERTBOT_DIR}"
  rm -rf "$EXPECTED"
  ln -s "$CERTBOT_DIR" "$EXPECTED"
elif [ -n "$CERTBOT_DIR" ]; then
  echo "[nginx-init] Using certbot cert at ${EXPECTED}"
elif [ ! -f "${EXPECTED}/fullchain.pem" ]; then
  # No cert at all — generate a temporary self-signed placeholder so nginx can start
  echo "[nginx-init] No certificate found — generating temporary self-signed cert"
  mkdir -p "$EXPECTED"
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout "${EXPECTED}/privkey.pem" \
    -out "${EXPECTED}/fullchain.pem" \
    -subj "/CN=${DOMAIN}" 2>/dev/null
  echo "[nginx-init] Run scripts/certbot-init.sh to replace with a real cert."
fi

exec nginx -g "daemon off;"
