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
If the separately saved provider account is also locked, the picker now shows
its API-key/sign-in form directly. No manual Disconnect step is required.

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

## Provider authorization recovery

Account status now verifies that the saved provider authorization can be
locally decrypted. Unreadable credentials appear disconnected without deleting
or modifying their stored ciphertext. Entering an API key or completing OAuth
explicitly replaces the saved authorization through the existing validated flow.

Provider decrypt failures, missing grants, expired grants without refresh tokens,
and provider HTTP 401 responses return DATABASE_PROVIDER_RECONNECT_REQUIRED.
The picker clears stale project/branch/database/role selections and reveals
account authorization again. Permission errors and temporary provider failures
retain their normal retry behavior. Tokens are cleared after successful saving,
and API-key inputs keep text/no-autofill behavior. Nothing changes the shared
encryption key or deletes customer data automatically.

Additional validation: 137 tests pass, including real encrypted account roundtrip,
key-change detection, retained ciphertext on failed status reads, explicit fresh
key replacement, and authorization-versus-permission/outage error codes.
provider-ui.jsonl checks both initial locked status and an authorization failure
mid-picker on desktop/light and phone/dark screens; the key form is immediately
usable and returns to database selection without a deletion request. Build and
TypeScript checks pass. No live provider credentials were used.
