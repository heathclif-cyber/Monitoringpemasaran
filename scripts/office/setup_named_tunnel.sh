#!/usr/bin/env bash
# Pasang Cloudflare named tunnel → https://pemasaranreg8.my.id
# Prasyarat:
#   1. Domain sudah ditambahkan di dashboard Cloudflare
#   2. Nameserver domain sudah 2 NS Cloudflare (bukan cloudhost.id)
#   3. Satu kali: cloudflared tunnel login  (browser)
set -euo pipefail

DOMAIN="${DOMAIN:-pemasaranreg8.my.id}"
TUNNEL_NAME="${TUNNEL_NAME:-monpem}"
ORIGIN="http://127.0.0.1:8000"
CF_DIR="${HOME}/.cloudflared"
CONFIG="${CF_DIR}/config.yml"

mkdir -p "$CF_DIR"

if [ ! -f "${CF_DIR}/cert.pem" ]; then
  echo "Belum login Cloudflare."
  echo "Jalankan di terminal desktop (akan buka browser):"
  echo "  cloudflared tunnel login"
  echo "Pilih zona ${DOMAIN}, izinkan, lalu jalankan skrip ini lagi."
  exit 1
fi

if ! cloudflared tunnel list 2>/dev/null | awk 'NR>1 {print $2}' | grep -qx "$TUNNEL_NAME"; then
  echo "==> buat tunnel ${TUNNEL_NAME}"
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID=$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}')
CRED="${CF_DIR}/${TUNNEL_ID}.json"
if [ ! -f "$CRED" ]; then
  echo "Credentials ${CRED} tidak ada."
  exit 1
fi

cat > "$CONFIG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED}

ingress:
  - hostname: ${DOMAIN}
    service: ${ORIGIN}
  - hostname: www.${DOMAIN}
    service: ${ORIGIN}
  - service: http_status:404
EOF
chmod 600 "$CONFIG"

echo "==> DNS CNAME ${DOMAIN} + www → tunnel"
cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "$DOMAIN" || true
cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "www.${DOMAIN}" || true

UNIT=/etc/systemd/system/monpem-tunnel.service
sudo tee "$UNIT" >/dev/null <<EOF
[Unit]
Description=Cloudflare named tunnel (${DOMAIN})
After=network-online.target monpem-ensure-up.service
Wants=network-online.target

[Service]
Type=simple
User=${USER}
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --config ${CONFIG} run ${TUNNEL_NAME}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now monpem-tunnel.service
sudo systemctl restart monpem-tunnel.service

echo
echo "Tunnel: ${TUNNEL_NAME} (${TUNNEL_ID})"
echo "Cek: https://${DOMAIN}/health"
echo "Log: journalctl -u monpem-tunnel -n 40 --no-pager"
