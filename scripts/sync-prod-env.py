#!/usr/bin/env python3
"""Synchronisiert Produktions-Variablen von 1Password nach Vercel bzw. Render.

Wird NICHT direkt aufgerufen, sondern ueber scripts/sync-prod-env.sh, das die
Werte per `op run --environment <ID>` als Umgebungsvariablen bereitstellt.
Werte werden nie ausgegeben, nur Namen und Status (gleich / neu / geaendert).

Nur Standardbibliothek. Ohne --apply wird nichts geschrieben.
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

VERCEL_ORG_ID = "team_GTRnjCA1AqYMFTeMF4SKpygy"
VERCEL_PROJECT_ID = "prj_2FLFo6ujE4EejrnlGoETGtbKd42p"
RENDER_SERVICE_ID = "srv-d7a2glnpm1nc73brf0tg"

# Explizite Allowlists: nur diese Namen werden je Ziel geschrieben. Alles andere
# im 1Password-Environment (z. B. RENDER_API_KEY) bleibt dort.
VERCEL_VARS = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "ENCRYPTION_KEY",
    "INTERNAL_SECRET",
    "BACKEND_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
]
# Bei Vercel als sensitive gespeichert: Der Wert ist nicht auslesbar (env pull liefert
# einen Platzhalter), ein Vergleich ist also unmoeglich. Geschrieben wird nur mit
# --write-sensitive, und zwar wieder als sensitive.
VERCEL_UNREADABLE = {
    "ENCRYPTION_KEY",
    "NEXTAUTH_SECRET",
    "CRON_SECRET",
    "INTERNAL_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
}
# Preview-Deployments laufen mit einer eigenen Datenbank (Neon) und eigenen Secrets.
# Alle sensitive, also nicht lesbar. BACKEND_URL und SUPABASE_SERVICE_ROLE_KEY gibt
# es in Preview bewusst nicht (KI-Funktionen und Bildupload sind dort aus).
PREVIEW_VARS = ["DATABASE_URL", "NEXTAUTH_SECRET", "ENCRYPTION_KEY", "INTERNAL_SECRET"]
RENDER_VARS = [
    "DATABASE_URL",
    "INTERNAL_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CORS_ORIGINS_RAW",
    "DEBUG",
    "UPLOAD_DIR",
    "ENVIRONMENT",
]


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def wanted(names: list[str]) -> dict[str, str]:
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        sys.exit(f"Fehlt in 1Password oder ist leer: {', '.join(missing)}")
    return {n: os.environ[n] for n in names}


def parse_dotenv(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            if len(val) >= 2 and val[0] == val[-1] == '"':
                val = val[1:-1].replace('\\"', '"').replace("\\n", "\n")
            out[key] = val
    return out


def classify(desired: dict[str, str], current: dict[str, str]) -> dict[str, str]:
    return {
        name: "gleich" if name in current and current[name] == value
        else ("neu" if name not in current else "geaendert")
        for name, value in desired.items()
    }


def report(target: str, status: dict[str, str]) -> list[str]:
    print(f"\n{target}:")
    for name, st in status.items():
        print(f"  {st:<9} {name}")
    return [n for n, s in status.items() if s != "gleich"]


def guard(target: str, changed: list[str], allow_enc: bool) -> None:
    if "ENCRYPTION_KEY" in changed and not allow_enc:
        sys.exit(
            "ENCRYPTION_KEY wuerde sich aendern. Damit werden alle gespeicherten "
            "Nutzer-API-Schluessel unlesbar. Nur mit --allow-encryption-key "
            "fortfahren, wenn die Daten vorher migriert wurden."
        )


# ── Vercel ───────────────────────────────────────────────────────────
def vercel(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ, "VERCEL_ORG_ID": VERCEL_ORG_ID, "VERCEL_PROJECT_ID": VERCEL_PROJECT_ID}
    return subprocess.run(
        ["vercel", *args, "--non-interactive"],
        input=stdin, text=True, capture_output=True, env=env,
    )


def sync_vercel(apply: bool, allow_enc: bool, write_sensitive: bool) -> None:
    desired = wanted(VERCEL_VARS)
    with tempfile.TemporaryDirectory() as tmp:
        os.chmod(tmp, 0o700)
        path = os.path.join(tmp, "prod.env")
        res = vercel(["env", "pull", path, "--environment=production", "--yes"])
        if res.returncode != 0:
            sys.exit(f"vercel env pull fehlgeschlagen:\n{res.stderr.strip()}")
        current = parse_dotenv(path)
    readable = {n: v for n, v in desired.items() if n not in VERCEL_UNREADABLE}
    status = classify(readable, current)
    for name in desired:
        if name in VERCEL_UNREADABLE:
            status[name] = "schreiben" if write_sensitive else "nicht lesbar"
    changed = [n for n in report("Vercel (Production)", status)
               if n not in VERCEL_UNREADABLE or write_sensitive]
    guard("vercel", changed, allow_enc)
    if not apply:
        return
    for name in changed:
        flag = ["--sensitive"] if name in VERCEL_UNREADABLE else []
        res = vercel(["env", "add", name, "production", "--force", "--yes", *flag], stdin=desired[name])
        if res.returncode != 0:
            sys.exit(f"vercel env add {name} fehlgeschlagen:\n{res.stderr.strip()}")
        print(f"  geschrieben: {name}")
    if changed:
        print("Hinweis: Vercel uebernimmt neue Werte erst mit einem neuen Deployment (Redeploy).")


def sync_preview(apply: bool, write_sensitive: bool) -> None:
    desired = wanted(PREVIEW_VARS)
    if "supabase" in desired["DATABASE_URL"].lower():
        sys.exit("Preview-DATABASE_URL zeigt auf Supabase. Preview braucht eine eigene Datenbank (Neon).")
    status = {n: "schreiben" if write_sensitive else "nicht lesbar" for n in desired}
    report("Vercel (Preview)", status)
    if not (apply and write_sensitive):
        return
    for name in desired:
        res = vercel(["env", "add", name, "preview", "--force", "--yes", "--sensitive"], stdin=desired[name])
        if res.returncode != 0:
            sys.exit(f"vercel env add {name} (preview) fehlgeschlagen:\n{res.stderr.strip()}")
        print(f"  geschrieben: {name}")


# ── Render ───────────────────────────────────────────────────────────
def render(method: str, path: str, body: dict | None = None):
    key = os.environ.get("RENDER_API_KEY")
    if not key:
        sys.exit("RENDER_API_KEY fehlt im 1Password-Environment 'Rezeptmeister Prod Backend'.")
    req = urllib.request.Request(
        f"https://api.render.com/v1{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        sys.exit(f"Render-API {method} {path}: HTTP {exc.code}")


def sync_render(apply: bool, allow_enc: bool) -> None:
    desired = wanted(RENDER_VARS)
    if desired["ENVIRONMENT"].lower() == "production" and desired["DEBUG"].lower() in ("1", "true", "yes", "on"):
        sys.exit("DEBUG ist in 1Password true bei ENVIRONMENT=production. Das Backend wuerde nicht starten.")
    rows = render("GET", f"/services/{RENDER_SERVICE_ID}/env-vars?limit=100")
    current = {r["envVar"]["key"]: r["envVar"].get("value", "") for r in rows}
    changed = report("Render (rezeptmeister-api)", classify(desired, current))
    guard("render", changed, allow_enc)
    if not apply:
        return
    for name in changed:
        render("PUT", f"/services/{RENDER_SERVICE_ID}/env-vars/{urllib.parse.quote(name)}",
               {"value": desired[name]})
        print(f"  geschrieben: {name}")
    if changed:
        print("Hinweis: Render braucht ein Deploy, damit die Werte greifen (Dashboard: Manual Deploy).")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Aufruf ueber scripts/sync-prod-env.sh")
    cmd, flags = sys.argv[1], set(sys.argv[2:])
    apply, allow_enc = "--apply" in flags, "--allow-encryption-key" in flags
    write_sensitive = "--write-sensitive" in flags
    if cmd == "secret-fingerprint":
        print(fingerprint(wanted(["INTERNAL_SECRET"])["INTERNAL_SECRET"]))
    elif cmd == "vercel":
        sync_vercel(apply, allow_enc, write_sensitive)
    elif cmd == "preview":
        sync_preview(apply, write_sensitive)
    elif cmd == "render":
        sync_render(apply, allow_enc)
    else:
        sys.exit(f"Unbekanntes Ziel: {cmd}")


if __name__ == "__main__":
    main()
