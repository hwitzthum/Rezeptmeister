"""Unit-Tests fuer scripts/sync-prod-env.py. Laufen ohne 1Password, Vercel oder Render.

    python3 -m unittest discover -s scripts -p "test_*.py" -v
"""

import importlib.util
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

_PATH = pathlib.Path(__file__).with_name("sync-prod-env.py")
_spec = importlib.util.spec_from_file_location("sync_prod_env", _PATH)
sync = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sync)


class Quiet(unittest.TestCase):
    """Unterdrueckt die Statusausgabe des Skripts waehrend der Tests."""

    def setUp(self):
        patcher = mock.patch("builtins.print")
        patcher.start()
        self.addCleanup(patcher.stop)


def env_with(values: dict[str, str]):
    return mock.patch.dict(os.environ, values, clear=True)


class FakeVercel:
    """Ersetzt sync.vercel(): `env pull` schreibt eine Datei, `env add` wird mitgeschrieben."""

    def __init__(self, pulled: dict[str, str] | None = None):
        self.pulled = pulled or {}
        self.adds: list[tuple[str, list[str], str | None]] = []

    def __call__(self, args, stdin=None):
        if args[:2] == ["env", "pull"]:
            pathlib.Path(args[2]).write_text(
                "".join(f'{k}="{v}"\n' for k, v in self.pulled.items()), encoding="utf-8"
            )
        elif args[:2] == ["env", "add"]:
            self.adds.append((args[2], args, stdin))
        return subprocess.CompletedProcess(args, 0, "", "")


class ClassifyAndParse(Quiet):
    def test_classify_marks_equal_new_and_changed(self):
        status = sync.classify({"A": "1", "B": "2", "C": "3"}, {"A": "1", "B": "x"})
        self.assertEqual(status, {"A": "gleich", "B": "geaendert", "C": "neu"})

    def test_parse_dotenv_handles_quotes_comments_and_equals_in_value(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp, "x.env")
            p.write_text('K1="a\\"b"\n# kommentar\nK2=plain\nK3=\nURL=postgres://u:p@h/db?x=1\n\n')
            parsed = sync.parse_dotenv(str(p))
        self.assertEqual(parsed, {"K1": 'a"b', "K2": "plain", "K3": "", "URL": "postgres://u:p@h/db?x=1"})

    def test_fingerprint_is_stable_and_distinguishes_values(self):
        self.assertEqual(sync.fingerprint("abc"), sync.fingerprint("abc"))
        self.assertNotEqual(sync.fingerprint("abc"), sync.fingerprint("abd"))
        self.assertEqual(len(sync.fingerprint("abc")), 12)


class Guards(Quiet):
    def test_wanted_aborts_on_missing_or_empty_variable(self):
        with env_with({"A": "1", "B": ""}):
            with self.assertRaises(SystemExit) as ctx:
                sync.wanted(["A", "B", "C"])
        self.assertIn("B", str(ctx.exception))
        self.assertIn("C", str(ctx.exception))

    def test_wanted_returns_values(self):
        with env_with({"A": "1"}):
            self.assertEqual(sync.wanted(["A"]), {"A": "1"})

    def test_encryption_key_change_needs_explicit_flag(self):
        with self.assertRaises(SystemExit):
            sync.guard("vercel", ["ENCRYPTION_KEY"], allow_enc=False)
        sync.guard("vercel", ["ENCRYPTION_KEY"], allow_enc=True)
        sync.guard("vercel", ["DATABASE_URL"], allow_enc=False)


class VercelProduction(Quiet):
    ENV = {n: f"wert-{n}" for n in sync.VERCEL_VARS}

    def run_sync(self, pulled, apply, allow_enc=False, write_sensitive=False):
        fake = FakeVercel(pulled)
        with env_with(self.ENV), mock.patch.object(sync, "vercel", fake):
            sync.sync_vercel(apply, allow_enc, write_sensitive)
        return fake

    def readable_pulled(self):
        return {n: f"wert-{n}" for n in sync.VERCEL_VARS if n not in sync.VERCEL_UNREADABLE}

    def test_dry_run_writes_nothing(self):
        fake = self.run_sync({}, apply=False, write_sensitive=True, allow_enc=True)
        self.assertEqual(fake.adds, [])

    def test_unreadable_variables_are_skipped_without_write_sensitive(self):
        fake = self.run_sync({}, apply=True)
        written = {name for name, _, _ in fake.adds}
        self.assertEqual(written, set(sync.VERCEL_VARS) - sync.VERCEL_UNREADABLE)
        for _, args, _ in fake.adds:
            self.assertNotIn("--sensitive", args)

    def test_equal_readable_variables_are_not_rewritten(self):
        fake = self.run_sync(self.readable_pulled(), apply=True)
        self.assertEqual(fake.adds, [])

    def test_write_sensitive_writes_all_unreadable_as_sensitive_to_production(self):
        fake = self.run_sync(self.readable_pulled(), apply=True, write_sensitive=True, allow_enc=True)
        self.assertEqual({n for n, _, _ in fake.adds}, sync.VERCEL_UNREADABLE)
        for name, args, stdin in fake.adds:
            self.assertEqual(args[3], "production")
            self.assertIn("--sensitive", args)
            self.assertEqual(stdin, f"wert-{name}")

    def test_encryption_key_requires_allow_flag_even_with_write_sensitive(self):
        with self.assertRaises(SystemExit):
            self.run_sync(self.readable_pulled(), apply=True, write_sensitive=True, allow_enc=False)


class VercelPreview(Quiet):
    ENV = {
        "DATABASE_URL": "postgresql://u:p@ep-x-pooler.c-8.eu-central-1.aws.neon.tech/neondb",
        "NEXTAUTH_SECRET": "a",
        "ENCRYPTION_KEY": "b",
        "INTERNAL_SECRET": "c",
    }

    def test_refuses_supabase_database(self):
        env = {**self.ENV, "DATABASE_URL": "postgresql://u:p@db.abc.SUPABASE.co:6543/postgres"}
        fake = FakeVercel()
        with env_with(env), mock.patch.object(sync, "vercel", fake):
            with self.assertRaises(SystemExit):
                sync.sync_preview(apply=True, write_sensitive=True)
        self.assertEqual(fake.adds, [])

    def test_needs_both_flags_to_write(self):
        for apply, write_sensitive in [(False, False), (True, False), (False, True)]:
            fake = FakeVercel()
            with env_with(self.ENV), mock.patch.object(sync, "vercel", fake):
                sync.sync_preview(apply, write_sensitive)
            self.assertEqual(fake.adds, [], (apply, write_sensitive))

    def test_writes_four_sensitive_variables_to_preview_only(self):
        fake = FakeVercel()
        with env_with(self.ENV), mock.patch.object(sync, "vercel", fake):
            sync.sync_preview(apply=True, write_sensitive=True)
        self.assertEqual({n for n, _, _ in fake.adds}, set(sync.PREVIEW_VARS))
        for _, args, _ in fake.adds:
            self.assertEqual(args[3], "preview")
            self.assertIn("--sensitive", args)

    def test_preview_has_no_backend_or_storage_key(self):
        self.assertNotIn("BACKEND_URL", sync.PREVIEW_VARS)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", sync.PREVIEW_VARS)


class RenderSync(Quiet):
    ENV = {n: f"wert-{n}" for n in sync.RENDER_VARS} | {"DEBUG": "false", "ENVIRONMENT": "production"}

    def api(self, existing):
        calls = []

        def fake(method, path, body=None):
            calls.append((method, path, body))
            if method == "GET":
                return [{"envVar": {"key": k, "value": v}} for k, v in existing.items()]
            return {}

        return fake, calls

    def test_debug_true_in_production_aborts_before_any_api_call(self):
        env = {**self.ENV, "DEBUG": "true"}
        fake, calls = self.api({})
        with env_with(env), mock.patch.object(sync, "render", fake):
            with self.assertRaises(SystemExit):
                sync.sync_render(apply=True, allow_enc=False)
        self.assertEqual(calls, [])

    def test_only_changed_variables_are_put(self):
        existing = {n: f"wert-{n}" for n in sync.RENDER_VARS if n != "ENVIRONMENT"}
        existing["DEBUG"] = "false"
        fake, calls = self.api(existing)
        with env_with(self.ENV), mock.patch.object(sync, "render", fake):
            sync.sync_render(apply=True, allow_enc=False)
        puts = [(m, p, b) for m, p, b in calls if m == "PUT"]
        self.assertEqual(len(puts), 1)
        self.assertTrue(puts[0][1].endswith("/env-vars/ENVIRONMENT"))
        self.assertEqual(puts[0][2], {"value": "production"})

    def test_dry_run_never_puts(self):
        fake, calls = self.api({})
        with env_with(self.ENV), mock.patch.object(sync, "render", fake):
            sync.sync_render(apply=False, allow_enc=False)
        self.assertEqual([c for c in calls if c[0] != "GET"], [])

    def test_render_api_key_is_never_synced(self):
        self.assertNotIn("RENDER_API_KEY", sync.RENDER_VARS)
        self.assertNotIn("RENDER_API_KEY", sync.VERCEL_VARS)


if __name__ == "__main__":
    unittest.main()
