#!/usr/bin/env bash
# Schiebt die Produktions-Variablen aus 1Password nach Vercel und Render.
# 1Password ist die Quelle; Vercel und Render sind abgeleitet.
#
#   scripts/sync-prod-env.sh                 Vergleich, schreibt nichts
#   scripts/sync-prod-env.sh --apply         schreibt Aenderungen
#   scripts/sync-prod-env.sh vercel|render|preview   nur ein Ziel
#   --write-sensitive                        schreibt auch die bei Vercel nicht lesbaren
#                                            (sensitive) Variablen; nie vergleichbar
#   --allow-encryption-key                   erlaubt Aenderung von ENCRYPTION_KEY
#
# Voraussetzung: `op` angemeldet (1Password-App > Einstellungen > Entwickler >
# "Mit 1Password-CLI integrieren") und `vercel` eingeloggt.
set -euo pipefail

PROD_ENV_ID="h2jlb3l3u7o35bcuhhebz7frh4"          # Rezeptmeister Prod (Vercel)
BACKEND_ENV_ID="fxvv6uw6lcvjh3y5lxhd5t5k4q"       # Rezeptmeister Prod Backend (Render)
PREVIEW_ENV_ID="sczimj7tzo2vl7i6ag3hjpykvq"       # Rezeptmeister Preview (Vercel Preview, Neon)
PY="$(cd "$(dirname "$0")" && pwd)/sync-prod-env.py"

targets=(); flags=()
for arg in "$@"; do
  case "$arg" in
    vercel|render|preview) targets+=("$arg") ;;
    --apply|--allow-encryption-key|--write-sensitive) flags+=("$arg") ;;
    *) echo "Unbekanntes Argument: $arg" >&2; exit 2 ;;
  esac
done
[ ${#targets[@]} -eq 0 ] && targets=(vercel render preview)

run_in() { # <environment-id> <ziel> [flags...]
  local env_id="$1"; shift
  op run --environment "$env_id" -- python3 "$PY" "$@"
}

# INTERNAL_SECRET muss bei Next.js (Vercel) und FastAPI (Render) identisch sein.
fp_prod="$(run_in "$PROD_ENV_ID" secret-fingerprint)"
fp_backend="$(run_in "$BACKEND_ENV_ID" secret-fingerprint)"
if [ "$fp_prod" != "$fp_backend" ]; then
  echo "Abbruch: INTERNAL_SECRET ist in 'Rezeptmeister Prod' und 'Rezeptmeister Prod Backend' verschieden." >&2
  exit 1
fi

# Preview muss eigene Secrets haben: gleicher INTERNAL_SECRET wie Produktion waere ein Fehler.
for t in "${targets[@]}"; do
  if [ "$t" = preview ]; then
    fp_preview="$(run_in "$PREVIEW_ENV_ID" secret-fingerprint)"
    if [ "$fp_preview" = "$fp_prod" ]; then
      echo "Abbruch: INTERNAL_SECRET in 'Rezeptmeister Preview' ist identisch mit Produktion." >&2
      exit 1
    fi
  fi
done

for t in "${targets[@]}"; do
  case "$t" in
    vercel) run_in "$PROD_ENV_ID" vercel "${flags[@]+"${flags[@]}"}" ;;
    render) run_in "$BACKEND_ENV_ID" render "${flags[@]+"${flags[@]}"}" ;;
    preview) run_in "$PREVIEW_ENV_ID" preview "${flags[@]+"${flags[@]}"}" ;;
  esac
done
