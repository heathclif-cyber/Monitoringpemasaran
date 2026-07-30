# Superman Agent — Device Lain (minimal kit, bukan full repo)

> **Jangan salin seluruh repository.**  
> User di PC lain cukup folder **`superman-agent-kit`** (hasil pack) + file `.env`.

Panduan isi kit & cara running:  
**→ di dalam kit: `README.md`**  
(sumber di repo: `scripts/superman/KIT_README.md`)

---

## Admin: buat zip untuk dibagikan

Di PC yang punya full repo:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
powershell -ExecutionPolicy Bypass -File scripts\superman\pack_agent_kit.ps1
Compress-Archive -Path dist\superman-agent-kit\* `
  -DestinationPath dist\superman-agent-kit.zip -Force
```

Hasil: `dist\superman-agent-kit.zip` → kirim ke staf.

Isi kit (kira-kira): `agent.py`, `services/superman/*`, `database.py`, `models.py`, dependensi import minimal, bat installer, README.  
**Tidak** ada frontend, Docker, full API, node_modules.

---

## User di device lain — ringkas

### Sekali
1. Unzip kit (mis. `D:\SupermanAgent\`)
2. Salin `.env.example` → `.env` → isi `DATABASE_URL` + `SUPERMAN_USER` + `SUPERMAN_PASSWORD`
3. Double-click **`1-Install-Sekali.bat`**

### Setiap kerja (deklarasi otomatis)
1. Double-click **`Mulai-Agent.bat`** → login **user app** (= login web) → **biarkan terbuka**
2. Browser → https://monitoringpemasaran-production.up.railway.app → login user yang **sama**
3. Invoice siap (bayar + dokumen) → **Buat Deklarasi Superman**
4. Agent di PC mengisi portal → nomor SPPn masuk invoice

Tanpa langkah 1, otomasi **tidak** jalan (Railway sering timeout ke Superman).

---

## Dua credential

| | App Monitoring | Portal Superman |
|--|----------------|-----------------|
| Di mana | `Mulai-Agent.bat` + browser | `.env` |
| Contoh | `budi` | `op_r08d_reg8` |
| Beda per orang? | Ya | Biasanya tidak (per unit) |

---

## Multi-user

Tiap orang: kit di PC sendiri + `Mulai-Agent.bat` dengan username sendiri + browser login sama.  
Job tidak saling ambil.

---

## Prompt Claude Cowork (hanya kit)

```
Ini folder superman-agent-kit (minimal), BUKAN full repo.
Ikuti README.md di root folder ini.

Path kit: <path>
.env: isi DATABASE_URL + SUPERMAN_* (atau sudah ada)
USER_APP / PASS_APP: <untuk Mulai-Agent.bat>

Setup install + jalankan agent watch sampai heartbeat online.
Jangan minta full repo. Jangan commit .env.
```

---

## Referensi lain

| File | Isi |
|------|-----|
| `scripts/superman/KIT_README.md` | README yang ikut ke dalam kit |
| `scripts/superman/pack_agent_kit.ps1` | Generator kit |
| `docs/operations/SUPERMAN_AGENT.md` | Ops ringkas (full repo) |
