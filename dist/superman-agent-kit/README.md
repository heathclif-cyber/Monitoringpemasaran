# Superman Agent Kit (minimal — bukan full repo)

Folder ini **cukup** di PC user untuk **deklarasi Superman otomatis**.  
Tidak perlu salin seluruh project Monitoringpemasaran.

```
App web (Railway)  →  antre job
       ↑                    ↓
  browser Anda      Agent di PC ini (folder kit)
                            ↓
                    portal Superman (Playwright)
```

**URL app:** https://monitoringpemasaran-production.up.railway.app

---

## Apa yang ada di kit ini?

| File / folder | Fungsi |
|---------------|--------|
| `1-Install-Sekali.bat` | Install Python package + Chromium (sekali) |
| `Mulai-Agent.bat` | Jalankan agent harian (biarkan terbuka) |
| `.env.example` | Template credential → salin jadi `.env` |
| `requirements.txt` | Dependensi Python agent saja |
| `scripts/superman/commands/agent.py` | Worker: ambil job + isi form |
| `scripts/superman/commands/login.py` | Login captcha portal (opsional) |
| `services/`, `api/`, `database.py`, `models.py` | Kode otomasi minimal |

**Tidak termasuk:** frontend, Docker, full API server, upload history besar, dsb.

---

## Dua password (jangan tertukar)

| | **App Monitoring** | **Portal Superman** |
|--|--------------------|---------------------|
| Dipakai di | `Mulai-Agent.bat` + login **browser web** | file **`.env`** |
| Contoh | `budi`, `admin` | `op_r08d_reg8` |
| Per orang? | **Ya** (beda user) | Biasanya **sama** di unit |
| Fungsi | Siapa yang punya job | Login isi SPPn di portal |

**Aturan emas:** username di bat = username di browser web.  
Kalau beda, job tidak akan dijalankan agent Anda.

---

## Setup sekali per PC (5 menit)

### 1) Python 3.12
- Install dari python.org, centang **Add to PATH**
- Cek: `python --version`

### 2) Unpack kit
Unzip folder `superman-agent-kit` ke mana saja, mis.:

`D:\SupermanAgent\`

Isi harus terlihat `Mulai-Agent.bat` di root folder itu.

### 3) Credential `.env` (sekali — tidak login tiap buka agent)
1. Salin `.env.example` → rename jadi **`.env`** (di folder yang sama)
2. Isi (minta ke admin jika belum punya):

```env
DATABASE_URL=postgresql://...production Railway...

# Login app Monitoring — agent pakai ini otomatis (tanpa prompt)
MONITORING_USER=putrisalsabila6835
MONITORING_PASSWORD=isi_password_app_anda

SUPERMAN_URL=https://superman.ptpn1.co.id/
SUPERMAN_USER=op_r08d_reg8
SUPERMAN_PASSWORD=********
SUPERMAN_HEADLESS=true
```

- `DATABASE_URL` = **Postgres production** yang dipakai web (bukan DB kosong)
- `MONITORING_USER` / `MONITORING_PASSWORD` = user **web** (bukan portal Superman)
- `SUPERMAN_*` = akun portal unit
- Setelah diisi sekali di `.env`, **`Mulai-Agent.bat` tidak minta username/password lagi**

### 4) Install sekali
Double-click **`1-Install-Sekali.bat`**  
atau:

```powershell
cd D:\SupermanAgent
pip install -r requirements.txt
python -m playwright install chromium
```

### 5) (Opsional) Captcha portal sekali
```powershell
python scripts\superman\commands\login.py --manual
```
Browser terbuka → selesaikan captcha → session tersimpan di PC.

---

## Cara running agar deklarasi **otomatis**

Ini alur kerja harian. **Agent harus hidup dulu**, baru klik di web.

### Langkah A — Nyalakan agent di PC (wajib)

1. Pastikan `.env` sudah berisi `MONITORING_USER` + `MONITORING_PASSWORD` (sekali setup)
2. Double-click **`Mulai-Agent.bat`** — **tidak perlu ketik login** (dibaca dari `.env`)
3. Tunggu tulisan mirip:

```text
User app: putrisalsabila6835
Login OK
Menunggu job executor=agent...
[hb] online_agents=1
```

4. **Jangan tutup** jendela itu (minimize boleh)

Tanpa langkah A, klik di web akan gagal / timeout Railway.

### Langkah B — Di browser (device mana pun)

1. Buka https://monitoringpemasaran-production.up.railway.app  
2. Login user **yang sama** dengan agent (langkah A)  
3. Buka invoice yang:
   - sudah ada pembayaran, dan  
   - dokumen lengkap (kontrak + invoice + rekening koran)  
4. Klik **Buat Deklarasi Superman** / **Buat SPPn**

### Langkah C — Biarkan otomatis

| Di web | Di jendela agent |
|--------|------------------|
| Progress % naik | Unduh PDF → buka browser headless → isi form |
| Selesai | Nomor SPPn/SPPb muncul di invoice |

Kalau captcha diminta: agent buka browser di **PC Anda** — selesaikan di situ (bukan di dialog web Railway).

### Diagram singkat

```
1. Mulai-Agent.bat  (PC)     ──heartbeat──►  Railway: "agent Budi online"
2. Web: Buat Deklarasi       ──buat job──►  Railway antre job (user_id=Budi)
3. Agent claim job           ◄────────────  Railway kasih job + link PDF
4. Playwright di PC          ──isi form──►  Superman portal
5. Agent kirim nomor SPP     ──complete──►  Railway simpan ke invoice
```

---

## Multi-user (beberapa orang, beberapa PC)

| Orang | Di PC-nya | Browser web |
|-------|-----------|-------------|
| Budi | `Mulai-Agent.bat` login **budi** | login **budi** |
| Ani | `Mulai-Agent.bat` login **ani** | login **ani** |

- Folder kit + `.env` SUPERMAN boleh **sama** isinya di semua PC.
- Yang beda hanya username/password **app** saat bat/browser.
- Job Budi **tidak** diambil agent Ani.

Satu orang dua PC: matikan agent di PC lama dulu (`Ctrl+C`).

---

## Cek status (opsional)

```powershell
cd D:\SupermanAgent
python scripts\superman\commands\agent.py status `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username USER_APP --password PASS_APP
```

Cari `"online": true` atau `"mine_online": true`.

---

## Troubleshooting

| Gejala | Perbaikan |
|--------|-----------|
| Stuck “Menunggu agent” | Jalankan `Mulai-Agent.bat`; samakan username web = bat |
| “.env belum ada” | Salin `.env.example` → `.env` dan isi |
| Login app gagal | Username/password **app** salah (bukan SUPERMAN_*) |
| Session Superman | `login.py --manual` atau biarkan agent buka captcha |
| python not found | Install Python 3.12 + PATH, buka ulang terminal |
| Module not found | Jalankan `1-Install-Sekali.bat` |
| Job user lain tidak jalan | Normal — tiap user pakai agent sendiri |

---

## Prompt Claude Cowork (device lain)

```
Folder ini adalah superman-agent-kit (bukan full repo Monitoringpemasaran).
Ikuti README.md: setup sekali (1-Install-Sekali.bat + .env), lalu jalankan Mulai-Agent.bat.

Saya berikan:
- path folder kit: ...
- DATABASE_URL / SUPERMAN_* : sudah di .env ATAU saya tempel di chat
- USER_APP / PASS_APP: ...

Jangan salin full repo. Jangan commit .env.
Setelah agent heartbeat online, beritahu saya siap klik Buat Deklarasi di web.
```

---

## Admin: regenerate kit dari full repo

Di mesin yang punya full repo Monitoringpemasaran:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
powershell -ExecutionPolicy Bypass -File scripts\superman\pack_agent_kit.ps1
Compress-Archive -Path dist\superman-agent-kit\* -DestinationPath dist\superman-agent-kit.zip -Force
```

Bagikan **zip** ke user (bukan seluruh git clone).
