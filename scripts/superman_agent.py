#!/usr/bin/env python3
"""Agent desktop lokal untuk deklarasi Superman (Opsi A).

App Monitoring tetap di Railway; Playwright + login Superman dijalankan di PC ini
(jaringan kantor yang biasanya lebih andal ke portal Superman).

Prasyarat:
  - Python 3.12 + dependensi project (playwright terinstall: `playwright install chromium`)
  - `.env` lokal berisi DATABASE_URL (Railway Postgres) + SUPERMAN_USER / SUPERMAN_PASSWORD
  - Session Superman lokal: `python scripts/superman_login.py --manual` jika perlu

Contoh:
  python scripts/superman_agent.py watch \\
    --api https://monitoringpemasaran-production.up.railway.app \\
    --username admin --password '***'

  # Atau pakai token:
  set MONITORING_API_TOKEN=eyJ...
  python scripts/superman_agent.py watch --api https://...

Env opsional:
  SUPERMAN_AGENT_ID   — id stabil antar-restart
  SUPERMAN_AGENT_NAME — nama tampilan
  SUPERMAN_HEADLESS=false — lihat browser
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

# Project root on sys.path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env")
except ImportError:
    pass

VERSION = "1.0.0"
DEFAULT_POLL = 3.0
DEFAULT_HEARTBEAT = 15.0


class ApiClient:
    def __init__(self, base: str, token: str, timeout: int = 120):
        self.base = base.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(
        self,
        method: str,
        path: str,
        *,
        data: dict | None = None,
        raw: bool = False,
    ):
        headers = {"Authorization": f"Bearer {self.token}"}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode("utf-8")
        url = self.base + path
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw_bytes = resp.read()
                if raw:
                    return raw_bytes, dict(resp.headers)
                if not raw_bytes:
                    return {}
                return json.loads(raw_bytes.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(detail)
                msg = parsed.get("detail", detail)
                if isinstance(msg, dict):
                    msg = msg.get("message") or json.dumps(msg, ensure_ascii=False)
            except Exception:
                msg = detail or str(exc)
            raise RuntimeError(f"HTTP {exc.code}: {msg}") from exc


def login(api: str, username: str, password: str) -> str:
    client = ApiClient(api, token="")
    # login without bearer
    url = api.rstrip("/") + "/api/auth/login"
    body = json.dumps({"username": username, "password": password}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError(f"Login gagal — respons tanpa token: {data}")
    return token


def download_docs(client: ApiClient, documents: list[dict], dest: Path) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for i, doc in enumerate(documents):
        doc_id = doc.get("document_id")
        if not doc_id:
            raise RuntimeError(f"Dokumen tanpa document_id: {doc}")
        name = doc.get("file_name") or f"doc_{doc_id}.pdf"
        # Hindari tabrakan nama
        safe = f"{i:02d}_{Path(name).name}"
        out = dest / safe
        raw, _headers = client.request(
            "GET",
            f"/api/documents/download/{int(doc_id)}",
            raw=True,
        )
        out.write_bytes(raw)
        if out.stat().st_size < 32:
            raise RuntimeError(f"File unduhan terlalu kecil: {out} ({doc.get('label')})")
        paths.append(out)
        print(f"  [doc] {doc.get('label')}: {out.name} ({out.stat().st_size} bytes)")
    return paths


def run_claimed_job(client: ApiClient, agent_id: str, job: dict) -> None:
    from services.superman.runner import submit_deklarasi_invoice

    job_id = job["job_id"]
    no_invoice = job["no_invoice"]
    documents = job.get("documents") or []
    print(f"\n=== JOB {job_id[:8]}… invoice={no_invoice} docs={len(documents)} ===")

    tmp = _ROOT / "scripts" / "_agent_docs" / job_id
    try:
        paths = download_docs(client, documents, tmp)

        last_report = [0.0]

        def on_progress(percent: int, stage: str) -> None:
            now = time.time()
            # throttle API progress ~1/s kecuali tahap penting
            if now - last_report[0] < 1.0 and percent not in (0, 5, 20, 50, 88, 95, 100):
                print(f"  {percent}% {stage}")
                return
            last_report[0] = now
            print(f"  {percent}% {stage}")
            try:
                client.request(
                    "POST",
                    "/api/superman/agent/progress",
                    data={
                        "agent_id": agent_id,
                        "job_id": job_id,
                        "percent": int(percent),
                        "stage": stage,
                    },
                )
            except Exception as exc:
                print(f"  [warn] progress API: {exc}")

        on_progress(3, "Agent mengunduh dokumen & memulai Playwright...")
        result = submit_deklarasi_invoice(
            no_invoice,
            on_progress=on_progress,
            support_doc_paths=paths,
            skip_preflight=True,  # sudah divalidasi saat start di server
        )
        # Jangan andalkan save lokal saja — server complete juga menyimpan.
        client.request(
            "POST",
            "/api/superman/agent/complete",
            data={"agent_id": agent_id, "job_id": job_id, "result": result},
        )
        saved = result.get("superman_saved") or result.get("message")
        print(f"=== SELESAI ok={result.get('ok')} {saved} ===\n")
    except Exception as exc:
        err = str(exc)
        print(f"=== GAGAL: {err} ===")
        traceback.print_exc()
        try:
            client.request(
                "POST",
                "/api/superman/agent/fail",
                data={"agent_id": agent_id, "job_id": job_id, "error": err[:2000]},
            )
        except Exception as fail_exc:
            print(f"  [warn] gagal report fail: {fail_exc}")
    finally:
        # Biarkan folder docs untuk debug; bersihkan file tua di luar scope
        pass


def cmd_watch(args: argparse.Namespace) -> int:
    api = (args.api or os.getenv("MONITORING_API_URL") or "").rstrip("/")
    if not api:
        print("Wajib --api atau env MONITORING_API_URL", file=sys.stderr)
        return 2

    token = args.token or os.getenv("MONITORING_API_TOKEN") or ""
    if not token:
        if not args.username or not args.password:
            print("Wajib --token atau --username/--password", file=sys.stderr)
            return 2
        print(f"Login ke {api} sebagai {args.username}...")
        token = login(api, args.username, args.password)
        print("Login OK")

    if not os.getenv("DATABASE_URL", "").strip():
        print(
            "PERINGATAN: DATABASE_URL kosong. Agent butuh DATABASE_URL (Postgres Railway) "
            "untuk membangun payload invoice. Isi di .env.",
            file=sys.stderr,
        )

    agent_id = (
        args.agent_id
        or os.getenv("SUPERMAN_AGENT_ID")
        or _load_or_create_agent_id()
    )
    name = args.name or os.getenv("SUPERMAN_AGENT_NAME") or socket.gethostname()
    client = ApiClient(api, token)
    print(f"Agent id={agent_id} name={name} api={api}")
    print("Menunggu job executor=agent... (Ctrl+C berhenti)")

    last_hb = 0.0
    while True:
        now = time.time()
        if now - last_hb >= args.heartbeat:
            try:
                hb = client.request(
                    "POST",
                    "/api/superman/agent/heartbeat",
                    data={
                        "agent_id": agent_id,
                        "name": name,
                        "hostname": socket.gethostname(),
                        "version": VERSION,
                    },
                )
                agent_id = hb.get("agent_id") or agent_id
                _save_agent_id(agent_id)
                last_hb = now
                online = hb.get("online_count", "?")
                print(f"[hb] online_agents={online} id={agent_id[:8]}…", flush=True)
            except Exception as exc:
                print(f"[hb] error: {exc}", flush=True)

        try:
            claimed = client.request(
                "POST",
                "/api/superman/agent/claim",
                data={"agent_id": agent_id},
            )
        except Exception as exc:
            print(f"[claim] error: {exc}", flush=True)
            time.sleep(args.poll)
            continue

        if claimed.get("claimed") and claimed.get("job"):
            run_claimed_job(client, agent_id, claimed["job"])
        else:
            time.sleep(args.poll)

    return 0


def _agent_id_path() -> Path:
    return _ROOT / "scripts" / ".superman_agent_id"


def _load_or_create_agent_id() -> str:
    path = _agent_id_path()
    if path.is_file():
        val = path.read_text(encoding="utf-8").strip()
        if val:
            return val
    aid = str(uuid.uuid4())
    _save_agent_id(aid)
    return aid


def _save_agent_id(agent_id: str) -> None:
    try:
        _agent_id_path().write_text(agent_id.strip(), encoding="utf-8")
    except Exception:
        pass


def cmd_status(args: argparse.Namespace) -> int:
    api = (args.api or os.getenv("MONITORING_API_URL") or "").rstrip("/")
    token = args.token or os.getenv("MONITORING_API_TOKEN") or ""
    if not token:
        if args.username and args.password:
            token = login(api, args.username, args.password)
        else:
            print("Butuh token/login", file=sys.stderr)
            return 2
    client = ApiClient(api, token)
    st = client.request("GET", "/api/superman/agent/status")
    print(json.dumps(st, indent=2, ensure_ascii=False))
    waiting = client.request("GET", "/api/superman/agent/waiting")
    print("waiting:", json.dumps(waiting, indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Superman local agent (Playwright di PC)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--api", default=os.getenv("MONITORING_API_URL", ""), help="Base URL app")
        sp.add_argument("--token", default="", help="Bearer token (atau env MONITORING_API_TOKEN)")
        sp.add_argument("--username", default=os.getenv("MONITORING_USER", ""))
        sp.add_argument("--password", default=os.getenv("MONITORING_PASSWORD", ""))

    w = sub.add_parser("watch", help="Heartbeat + claim job + jalankan Playwright")
    add_common(w)
    w.add_argument("--agent-id", default="")
    w.add_argument("--name", default="")
    w.add_argument("--poll", type=float, default=DEFAULT_POLL)
    w.add_argument("--heartbeat", type=float, default=DEFAULT_HEARTBEAT)
    w.set_defaults(func=cmd_watch)

    s = sub.add_parser("status", help="Cek agent online + job menunggu")
    add_common(s)
    s.set_defaults(func=cmd_status)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        print("\nAgent dihentikan.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
