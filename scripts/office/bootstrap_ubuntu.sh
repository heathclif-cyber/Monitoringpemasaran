#!/usr/bin/env bash
# Phase 0–1 + cloudflared. Jalankan dengan sudo.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> Mask sleep/suspend (PC 24 jam)"
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target || true

echo "==> Update + paket dasar"
apt-get update
apt-get upgrade -y
apt-get install -y git curl ca-certificates gnupg lsb-release ufw

echo "==> Docker Engine (repo resmi)"
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo ${UBUNTU_CODENAME:-$VERSION_CODENAME}) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

TARGET_USER="${SUDO_USER:-apps-server}"
usermod -aG docker "$TARGET_USER"
systemctl enable --now docker
systemctl enable --now containerd

echo "==> cloudflared"
if [ ! -f /usr/share/keyrings/cloudflare-main.gpg ]; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
fi
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y cloudflared

echo "==> VERIFY"
docker --version
docker compose version
cloudflared --version
systemctl is-active docker
echo "OK bootstrap selesai (user $TARGET_USER di group docker)"
