# Deployment and Rollback

Status: Release-candidate procedure; final artifact deployment and rollback rehearsal not yet recorded

## Architecture

The application uses the existing React/Vinext/Vite project and OpenAI Sites hosting integration. .openai/hosting.json has no D1 or R2 binding; 1.0 gameplay is local-first and does not require a database, account service, or secrets. The Cloudflare-style worker adapter serves the built app but is not a gameplay backend.

## Prerequisites

- Node.js 22.15 or newer, npm, and a clean checkout.
- Lockfile present and unchanged after npm ci.
- Authorized Sites project/environment for preview or production.
- Release identifier agreed and all release checklist gates complete.

## Local verification

    npm ci
    npm run lint
    npm test
    npm run build
    npm run start

Use the actual scripts in package.json. If typecheck or browser-test scripts are added, run them explicitly. Inspect the build output under dist and its .openai hosting metadata; record the actual artifact paths and hashes in the release report.

Serve the production output over localhost/HTTPS-capable preview where possible. A development server is not offline or performance evidence.

## Preview deployment

1. Build from the intended commit with no untracked release inputs.
2. Deploy through the repository’s Sites preview workflow.
3. Record commit, build log, preview URL, headers, artifact size, and service-worker/cache version.
4. Run the critical browser path, storage recovery, offline reload, CSP/network, accessibility smoke, and benchmark smoke.
5. Do not promote a preview with unresolved critical/high defects or incomplete human release gates.

## Production promotion

1. Freeze the release commit and tag/version.
2. Re-run clean install, full test suite, content validation, build, security/license/secret checks.
3. Confirm privacy, support, known issues, notices, release notes, cultural review, and legal/security approvals.
4. Verify HTTPS and response headers on the final origin.
5. Deploy the exact preview-tested artifact; do not rebuild with different inputs.
6. Smoke new game, load existing/migrated save, offline reload, update notification, and reset.
7. Publish release notes only after smoke passes.

A private preview may be created for the exact-artifact browser/offline evidence gates. Do not promote it as an approved production release until `RELEASE_CHECKLIST.md` records GO.

## Cache and save safety

Application cache versions are independent of IndexedDB save versions. A deployment may replace code/assets only after its full precache succeeds. Activation prompts the player to save/reload. Never delete game saves in service-worker install/activate handlers. A content/schema upgrade must ship tested save migrations before promotion.

## Rollback

1. Stop promotion and preserve logs/screenshots.
2. Redeploy the last known-good immutable artifact, not a fresh rebuild.
3. Keep IndexedDB untouched. Old code must either read the current save version or show a non-destructive “newer save” message.
4. If a forward migration is irreversible, do not roll back code blindly; ship a repaired forward build or a tested reverse adapter.
5. Verify launch, existing save load, offline reload, and headers on the rolled-back origin.
6. Document incident, affected versions, user guidance, and corrective tests.

## Environment and secrets

No client secret is permitted. Environment values embedded by Vite are public and must be treated as configuration only. D1/R2 remain disabled unless a separately approved requirement changes the architecture.
