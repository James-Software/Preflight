# Recovering a locked database connection

Run startup decrypts the project's saved connection in the web app before it
creates a run or triggers a worker. A lock error in the launch dialog therefore
means the current web deployment cannot decrypt that saved ciphertext; it is
not a completed Neon connectivity test. It can reflect a changed encryption key,
changed authenticated context, or corrupted stored data. No production record or
environment variable was inspected from this workspace.

Open Project → Database → Reconnect, then select the database again or enter a
fresh URI. This saves fresh encrypted credentials after the normal read-only
connectivity test. It does not delete database records. Provider reselection
skips decrypting old configuration when its trusted metadata says there are zero
custom checks. Previously that unnecessary decrypt prevented recovery itself.
Connections with advanced checks still require readable prior settings so the
checks are preserved. If those settings are locked, restore the original key or
explicitly disconnect the saved connection before replacing the checks.

Run-start errors now carry DATABASE_CONNECTION_LOCKED and the dialog offers a
project-specific Reconnect database link. Verification is never silently disabled.
If the separately saved provider account is also locked, reconnect that account
using its existing Disconnect account control and a fresh provider authorization.

New immutable run snapshots also contain a domain-separated encryption-key
fingerprint (not the key). Worker replay compares it before decrypting and reports
a specific PROFILE_ENCRYPTION_KEY mismatch. Old snapshots remain compatible.
Preflight failures insert a report row even when the run has no advanced checks,
so a worker key problem appears in the report rather than only a task log.
Vercel and Trigger.dev must still share the same stable key and deployed values.
Reconnecting creates usable new snapshots; it cannot repair earlier snapshots.

Validation: 135 tests pass, including zero-check recovery, preservation of custom
checks, startup before task allocation, snapshot key mismatch and report evidence.
Production build/typecheck passed. storage.jsonl exercises actual PostgreSQL via
PGlite using the real encrypted snapshot/verification/cleanup helpers. ui.jsonl
checks recovery links, preserved origin, enabled verification and advanced-check
protection in Chromium at desktop/light and phone/dark sizes. These tests use
synthetic data; no paid swarm or customer database was accessed.
