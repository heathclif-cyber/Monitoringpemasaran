# Playbook AI — Migrasi Railway → Ubuntu Desktop 24.04

> **Untuk:** PC kantor Ubuntu **Desktop** 24.04 LTS + VS Code/Cursor + AI agent.  
> **Ini satu-satunya playbook migrasi Railway → PC kantor** (jalur Windows/PowerShell sudah dihapus).  
> **User:** install OS sekali, jawab variabel, lalu **menunggu** AI.  
> **Akhir sukses:** agent menampilkan **URL final** (LAN + internet jika tunnel).  
> **Stack:** `docker-compose.yml` + Postgres + `SUPERMAN_DEFAULT_EXECUTOR=server`.

```text
User install Ubuntu Desktop 24.04 + Docker Engine
         ↓
VS Code / Cursor + AI agent (bash)
         ↓
Phase 0–7 → URL LAN (dan tunnel opsional)
         ↓
cron / systemd: auto git pull + rebuild
```

| Item | Nilai baku |
|------|------------|
| OS unduhan | **Ubuntu 24.04 LTS Desktop** (bukan Server / WSL / Core / Cloud) |
| Repo | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| Working dir | `~/Apps/Monitoringpemasaran` (atau path user) |
| Shell | **bash** (Terminal / VS Code integrated terminal) |
| App port | **8000** |
| Health | `GET http://127.0.0.1:8000/health` → `{"status":"ok"}` |
| Superman | `SUPERMAN_DEFAULT_EXECUTOR=server` |
| Container runtime | **Docker Engine** + Compose plugin |
| Konsep singkat | [KANTOR_MURNI.md](./KANTOR_MURNI.md) |

---

## Pilih OS unduhan (wajib)

| Opsi di ubuntu.com | Ambil? | Alasan |
|--------------------|--------|--------|
| **Desktop** | **Ya** | GUI + browser + VS Code/Cursor + AI migrasi |
| Server | Tidak (default jalur ini) | Tanpa GUI; VS Code lokal susah |
| WSL | Tidak | Butuh Windows dulu |
| Core / Cloud | Tidak | Bukan install PC fisik kantor |

Desktop **tidak** menyunat kemampuan server untuk app ini (Docker, Postgres, port 8000, Superman di container tetap sama). Yang ditambah: GUI. Yang dikorbankan: RAM idle sedikit lebih besar.

**RAM:** ideal **16 GB**. Di **8 GB** tetap bisa; tutup browser berat saat `docker compose build` / deklarasi Superman.

---

## 0. Instruksi ke AI agent (WAJIB)

Saat user bilang: **“migrasi ke PC kantor”**, **“migrasi Ubuntu”**, **“eksekusi MIGRATE_RAILWAY_TO_UBUNTU”**, **“setup office”**, atau sejenis:

1. Baca **file ini penuh** (satu-satunya playbook migrasi kantor).
2. Semua perintah **bash** + `docker compose` — tidak ada script PowerShell di repo.
3. Phase A — tanya variabel sekali; **jangan tebak secret**.
4. Eksekusi Phase **0 → 1 → 2 → 3 → 5 → 4 → 6 → 7** (lihat mode).
5. Setelah **setiap** step: **VERIFY**. Gagal → **STOP**, laporkan error + step.
6. **Jangan** matikan Railway sampai Phase 7 + user setuju.
7. **Jangan** commit/push `.env`, password, token Cloudflare, dump SQL.
8. **Jangan** expose Postgres ke internet (`127.0.0.1:5432` saja — sudah di compose).
9. **Jangan** arahkan multi-agent / Mulai-Agent.bat.
10. Di akhir: cetak **OUTPUT FINAL**.
11. HTTP health: `curl -sS` (bukan `curl.exe`).

### Mode

| Kata user | Fase |
|-----------|------|
| `setup penuh` / `migrasi penuh` / default | 0→1→2→3→5→4→6→7 |
| `hanya lokal` / `LAN dulu` | 0→1→2→3→5 |
| `tanpa migrasi DB` | Skip dump Railway |
| `hanya tunnel` | Phase 4 |
| `hanya auto-update github` | Phase 6 |

### Prinsip “user menunggu”

- AI menjalankan perintah bash; user **tidak** disuruh hafal Docker.
- User hanya: install Ubuntu Desktop sekali, login Cloudflare (Phase 4), setuju cutover Railway, isi captcha Superman di **web**.

---

## Phase A — Variabel (sekali di awal)

| ID | Wajib? | Arti | Contoh |
|----|--------|------|--------|
| `REPO_DIR` | Ya | Path repo | `/home/ptpn/Apps/Monitoringpemasaran` |
| `GITHUB_URL` | Ya | Clone URL | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| `POSTGRES_PASSWORD` | Ya | Password DB lokal, min 16, hindari `@ # : / %` | generate |
| `SECRET_KEY` | Ya | JWT secret, min 32 char | generate |
| `RAILWAY_DB_URL` | Ya* | Postgres Railway untuk dump | `postgresql://…` |
| `SUPERMAN_USER` | Ya | Portal Superman unit | — |
| `SUPERMAN_PASSWORD` | Ya | Password portal | — |
| `DOMAIN` | Phase 4 | Hostname Cloudflare | `monitoring.perusahaan.com` |
| `LINUX_USER` | Phase 4/6 | User login Ubuntu | `whoami` |
| `MIGRATE_DATA` | Ya | `yes` = dump Railway; `no` = kosong | `yes` |

\*Jika `MIGRATE_DATA=no`, skip dump.

### Generate secret

```bash
tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48; echo
```

### Checklist prasyarat (user)

- [ ] ISO **Ubuntu 24.04 LTS Desktop** terpasang
- [ ] Akses Railway Database URL (jika migrasi data)
- [ ] Domain Cloudflare (jika internet publik)
- [ ] PC colok listrik, tidak sleep, akan nyala 24 jam

---

## Phase 0 — PC 24 jam + dasar OS

### 0.1 Jangan sleep (GUI + CLI)

Settings → Power → **Automatic Suspend = Off** (plugged in).

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
# Cegah suspend via systemd (server-like)
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target 2>/dev/null || true
```

**VERIFY:** PC tidak suspend saat idle + colok listrik.

### 0.2 Update sistem

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg lsb-release ufw
```

### 0.3 Catat IP LAN

```bash
hostname -I | awk '{print $1}'
# atau:
ip -4 -br addr show | grep -v 'lo\|docker\|br-'
```

Simpan `LAN_IP` untuk OUTPUT FINAL.

---

## Phase 1 — Docker Engine + VS Code + repo

### 1.1 Docker Engine (disarankan; lebih ringan dari Docker Desktop)

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo ${UBUNTU_CODENAME:-$VERSION_CODENAME}) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

User **logout/login** (atau reboot) agar group `docker` aktif.

**VERIFY:**

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Daemon harus running tanpa wajib `sudo` setelah re-login.

### 1.2 VS Code atau Cursor (untuk AI migrasi)

```bash
# VS Code
sudo snap install code --classic

# ATAU Cursor: unduh .deb dari https://cursor.com lalu:
# sudo apt install ./cursor_*.deb
```

Buka folder repo setelah clone (`code .` / `cursor .`).  
AI **wajib mode Agent** (bisa jalankan terminal), bukan chat teks saja.

Ekstensi berguna: **Docker** (Microsoft).

### 1.3 Clone / pull

```bash
REPO_DIR="${REPO_DIR:-$HOME/Apps/Monitoringpemasaran}"
GITHUB_URL="${GITHUB_URL:-https://github.com/heathclif-cyber/Monitoringpemasaran.git}"
mkdir -p "$(dirname "$REPO_DIR")"
if [ -f "$REPO_DIR/docker-compose.yml" ]; then
  cd "$REPO_DIR"
  git fetch origin
  git checkout main
  git pull origin main
else
  git clone "$GITHUB_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi
```

**VERIFY:**

```bash
test -f docker-compose.yml && test -f .env.office.example && echo OK
```

---

## Phase 2 — Env + migrasi database Railway

### 2.1 Buat `.env`

```bash
cd "$REPO_DIR"
cp -n .env.office.example .env
# edit dengan editor atau AI — jangan log password ke chat publik
```

Isi minimal (ganti nilai):

```env
POSTGRES_USER=ptpn
POSTGRES_PASSWORD={{POSTGRES_PASSWORD}}
POSTGRES_DB=monitoringpemasaran
SECRET_KEY={{SECRET_KEY}}
RUN_DB_MIGRATE=true
SUPERMAN_URL=https://superman.ptpn1.co.id/
SUPERMAN_USER={{SUPERMAN_USER}}
SUPERMAN_PASSWORD={{SUPERMAN_PASSWORD}}
SUPERMAN_HEADLESS=true
SUPERMAN_DEFAULT_EXECUTOR=server
```

**VERIFY:** file `.env` ada; key names `POSTGRES_*`, `SECRET_KEY`, `SUPERMAN_DEFAULT_EXECUTOR` (cek nama key saja).

### 2.2 Start Postgres

```bash
cd "$REPO_DIR"
docker compose up -d db
# tunggu healthy
for i in $(seq 1 24); do
  docker compose exec -T db pg_isready -U ptpn -d monitoringpemasaran && break
  sleep 5
done
```

### 2.3 Migrasi data (`MIGRATE_DATA=yes`)

```bash
cd "$REPO_DIR"
mkdir -p backups
DUMP="backups/railway_$(date +%Y%m%d_%H%M%S).sql"
# RAILWAY_DB_URL dari user — jangan commit
docker run --rm postgres:16-alpine \
  sh -c "pg_dump \"$RAILWAY_DB_URL\" --no-owner --no-acl" \
  > "$DUMP"
ls -lh "$DUMP"
```

**VERIFY:** ukuran dump > 1 KB.

Restore:

```bash
# sesuaikan user/db dengan .env
cat "$DUMP" | docker compose exec -T db psql -U ptpn -d monitoringpemasaran
```

**VERIFY:**

```bash
docker compose exec -T db psql -U ptpn -d monitoringpemasaran -c '\dt' | head -n 40
```

Harus ada tabel bisnis (invoice/kontrak/users, dll.).

Jika `pg_dump` gagal SSL/URL: pakai **public** Database URL Railway (bukan pooler), pastikan password di URL ter-encode.

### 2.4 Skip migrasi (`MIGRATE_DATA=no`)

Lewati dump; Phase 3 `RUN_DB_MIGRATE=true` buat schema kosong.

### 2.5 Uploads (opsional)

Salin backup folder `uploads/` ke `$REPO_DIR/uploads/`.

---

## Phase 3 — Build & jalankan app

```bash
cd "$REPO_DIR"
docker compose up -d --build
docker compose ps
curl -sS -m 20 http://127.0.0.1:8000/health
```

**VERIFY health:** body mengandung status ok.

**VERIFY login** (opsional; user beri 1 akun existing setelah restore):

```bash
curl -sS -m 20 -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}'
```

**VERIFY Superman reachability dari container:**

```bash
docker compose exec -T app python -c \
  "import urllib.request; r=urllib.request.urlopen('https://superman.ptpn1.co.id/', timeout=20); print(r.status)"
```

Harus `200` (atau 3xx). Timeout → jaringan kantor tidak tembus portal — **STOP**, laporkan IT.

---

## Phase 5 — Firewall LAN + autostart Docker

### 5.1 UFW port 8000 (+ SSH jika remote)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8000/tcp comment 'Monitoring Pemasaran'
sudo ufw --force enable
sudo ufw status
```

### 5.2 Docker start on boot

```bash
sudo systemctl enable docker
sudo systemctl enable containerd
```

Compose sudah `restart: unless-stopped` — setelah reboot, container naik lagi jika Docker jalan.

**Opsional — pastikan stack up tiap boot** (`ensure_up` setara Windows):

```bash
mkdir -p "$REPO_DIR/logs"
cat <<EOF | sudo tee /etc/systemd/system/monpem-ensure-up.service
[Unit]
Description=Monitoring Pemasaran docker compose up
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User={{LINUX_USER}}
WorkingDirectory={{REPO_DIR}}
ExecStart=/usr/bin/docker compose up -d
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable monpem-ensure-up.service
```

---

## Phase 4 — Cloudflare Tunnel (opsional, akses internet)

1. Install `cloudflared` (paket resmi Cloudflare untuk Linux / Ubuntu).
2. `cloudflared tunnel login` (browser).
3. Buat tunnel → origin `http://127.0.0.1:8000`.
4. DNS CNAME domain ke tunnel.
5. Install **systemd service** `cloudflared` agar jalan setelah reboot.

**VERIFY:** `https://{{DOMAIN}}/health` dari luar LAN.

Tanpa domain: quick tunnel hanya sementara — jangan andalkan production.

---

## Phase 6 — Auto-update dari GitHub

```bash
mkdir -p "$REPO_DIR/logs" "$REPO_DIR/scripts/office"
cat > "$REPO_DIR/scripts/office/auto_deploy.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
LOG="$ROOT/logs/auto_deploy.log"
{
  echo "==== $(date -Iseconds) ===="
  git fetch origin
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master)
  if [ "$LOCAL" != "$REMOTE" ]; then
    git pull --ff-only origin main || git pull --ff-only origin master
    docker compose up -d --build
    echo "deployed $REMOTE"
  else
    echo "no update"
  fi
} >>"$LOG" 2>&1
SCRIPT
chmod +x "$REPO_DIR/scripts/office/auto_deploy.sh"
```

Cron tiap 15 menit:

```bash
(crontab -l 2>/dev/null | grep -v 'auto_deploy.sh'; true
 echo "*/15 * * * * $REPO_DIR/scripts/office/auto_deploy.sh"
) | crontab -
```

**VERIFY:** `crontab -l` memuat `auto_deploy.sh`.  
Repo harus bisa `git pull` tanpa prompt (HTTPS credential helper / SSH key).

---

## Phase 7 — Backup harian + cutover Railway

### 7.1 Backup DB

```bash
mkdir -p "$HOME/Backup/MonitoringPemasaran" "$REPO_DIR/scripts/office"
cat > "$REPO_DIR/scripts/office/backup_db.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="$HOME/Backup/MonitoringPemasaran"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M%S)
docker compose exec -T db pg_dump -U ptpn -d monitoringpemasaran --no-owner --no-acl \
  > "$OUT/monpem_$STAMP.sql"
# simpan 14 file terbaru
ls -1t "$OUT"/monpem_*.sql 2>/dev/null | tail -n +15 | xargs -r rm --
SCRIPT
chmod +x "$REPO_DIR/scripts/office/backup_db.sh"
```

Cron harian 02:00:

```bash
(crontab -l 2>/dev/null | grep -v 'backup_db.sh'; true
 echo "0 2 * * * $REPO_DIR/scripts/office/backup_db.sh"
) | crontab -
```

### 7.2 Cutover (hanya setelah user setuju)

Checklist sebelum matikan Railway:

- [ ] `http://LAN_IP:8000/health` ok
- [ ] Login app + data kontrak/invoice terlihat
- [ ] Upload/dokumen (jika dipakai) ada
- [ ] Superman captcha di web OK (sekali)
- [ ] Backup lokal sudah jalan / dump manual disimpan
- [ ] Staf diberi URL baru

**Jangan** matikan Railway hanya untuk tes — tunggu cutover disetujui.

---

## OUTPUT FINAL (wajib dicetak AI)

```markdown
## ✅ Migrasi siap (Ubuntu Desktop 24.04)

| Item | Nilai |
|------|--------|
| Status | SUKSES / GAGAL (fase terakhir: …) |
| OS | Ubuntu Desktop 24.04 |
| PC | {{hostname}} |
| LAN URL | http://{{LAN_IP}}:8000 |
| Internet URL | https://{{DOMAIN}}  (atau: belum) |
| Health | http://…/health → ok |
| Superman | server di PC kantor (executor=server) |
| Auto-update GitHub | cron auto_deploy.sh tiap 15 mnt |
| Ensure up | systemd monpem-ensure-up (jika dipasang) |

### Yang staf lakukan
1. Buka **LAN URL** atau **Internet URL**
2. Login seperti biasa
3. Buat Deklarasi Superman — captcha di **web** jika diminta
4. Tidak install bat/agent di laptop

### Yang admin lakukan
- PC kantor: biarkan nyala; user boleh login GUI Ubuntu
- Docker Engine enabled on boot
- Update app: push ke GitHub `main` → cron rebuild

### Railway
- Status: masih hidup / dijadwalkan dimatikan setelah: …
```

---

## Jika gagal (diagnostik cepat)

```bash
cd "$REPO_DIR"
docker compose ps
docker compose logs app --tail 80
curl -sS -m 15 http://127.0.0.1:8000/health
tail -n 30 logs/auto_deploy.log 2>/dev/null || true
```

| Gejala | Tindakan |
|--------|----------|
| `permission denied` docker | re-login setelah `usermod -aG docker`; cek `groups` |
| Docker daemon down | `sudo systemctl start docker` |
| Health 502/empty | `docker compose logs app` |
| OOM / PC lemot 8 GB | tutup browser; tambah swap atau RAM; build ulang |
| Superman timeout dari container | jaringan PC → portal; proxy/firewall IT |
| Tunnel 502 | `systemctl status cloudflared` |
| Auto deploy tidak jalan | `crontab -l` + log + `git remote` auth |

---

## Prompt siap pakai (user → AI di VS Code/Cursor)

```text
Eksekusi docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md setup penuh.
OS: Ubuntu Desktop 24.04. Perintah bash + docker compose.
Variabel: REPO_DIR=… POSTGRES_PASSWORD=… SECRET_KEY=… SUPERMAN_*=…
RAILWAY_DB_URL=… MIGRATE_DATA=yes
Jangan matikan Railway; jangan commit .env; outputkan URL final.
```

Mode LAN saja: ganti jadi **`hanya lokal`**.

---

## Ringkas untuk user manusia

1. Install **Ubuntu 24.04 Desktop** (bukan Server/WSL/Core/Cloud).  
2. Buka repo di **VS Code atau Cursor** di PC itu.  
3. Chat AI: **“Eksekusi docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md setup penuh”**.  
4. Jawab password DB, Railway URL, Superman, domain (jika ada).  
5. **Tunggu** tabel URL.  
6. Bookmark URL; staf hanya browser.  
7. Update fitur: push GitHub → cron auto deploy.

---

## Referensi silang

| File | Isi |
|------|-----|
| [KANTOR_MURNI.md](./KANTOR_MURNI.md) | Konsep PC kantor murni (tanpa multi-agent) |
| `.env.office.example` | Template env |
| `docker-compose.yml` | App + Postgres |
| `scripts/office/*.sh` | Dibuat di Phase 6–7 di PC (auto_deploy, backup_db) — tidak di-commit `.ps1` |

---

## Changelog

| Tanggal | Perubahan |
|---------|-----------|
| 2026-08-12 | Playbook awal: Ubuntu Desktop 24.04, Docker Engine, bash dump/restore, systemd/cron |
| 2026-08-12 | Jalur Windows dihapus; file ini satu-satunya playbook migrasi kantor |
