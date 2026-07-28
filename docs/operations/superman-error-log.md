# Superman automatic error log

Untuk **AI agent / operator** yang men-debug kegagalan Superman tanpa membaca log Railway penuh.

## Lokasi file

| Env | Path default |
|-----|----------------|
| `SUPERMAN_ERROR_LOG_PATH` | (override) |
| sibling `SUPERMAN_STATE_PATH` | `/data/superman_error_log.jsonl` di Railway |

Format: **JSONL** (satu event per baris, append-only, rotate ~8MB).

## API

```http
GET /api/superman/error-log?limit=50
Authorization: Bearer <token staff/admin>
```

Response:

```json
{
  "path": "/data/superman_error_log.jsonl",
  "count": 12,
  "events": [ { "...": "newest first" } ]
}
```

## Field event

| Field | Arti |
|-------|------|
| `id` | UUID event |
| `ts` / `ts_iso` | Waktu UTC |
| `severity` | `error` \| `warning` |
| `kind` | Klasifikasi otomatis (lihat bawah) |
| `source` | `captcha_start`, `fail_job`, `complete_job_not_ok`, `api_captcha`, … |
| `message` | Pesan error (max ~2000 char) |
| `no_invoice` | Invoice terkait (jika ada) |
| `job_id` | Job deklarasi (jika ada) |
| `executor` | `server` \| `agent` |
| `context` | Debug aman (tanpa password/cookie/token) |

## `kind` yang sering muncul

| kind | Arti tipikal |
|------|----------------|
| `captcha_network_timeout` | Railway tidak bisa connect ke portal (BUG-016) |
| `store_network_abort` | POST `/spp/store` putus (`NS_BINDING_ABORTED` / ALPN) |
| `todo_fetch_error` | `getTodo` timeout |
| `job_wall_timeout` | Job > 3 menit (server) |
| `session_invalid` | Session / captcha required |
| `unknown` | Belum diklasifikasi |

## Sumber tulis otomatis

- Gagal captcha start (timeout 3×)
- `fail_job` / job stale timeout
- `complete_job` dengan `ok: false` (partial store)
- Error captcha API (selain yang sudah di-log captcha_start)

## Catatan untuk AI

1. Baca **10–50 event terbaru** dulu; bandingkan `kind` + `no_invoice`.
2. `captcha_network_timeout` berulang = infrastruktur Railway→Superman, bukan bug form invoice.
3. `store_network_abort` = BUG-009/012; coba agent lokal / retry.
4. Jangan commit secret; file log di volume production saja.

Lihat juga: `docs/notes/bug.md` **BUG-016**, `SUPERMAN_AGENT.md` (agent lokal).
