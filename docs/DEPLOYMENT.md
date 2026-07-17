# Deployment and Rollback Runbook

Status: Vercel automation implemented; public production remains **NO-GO** until the release checklist records all required browser, offline, accessibility, cultural, security, and legal reviews.

This runbook separates automated work from steps that require access to the Vercel and GitHub accounts. Never paste access tokens into chat, source files, screenshots, issue comments, or workflow logs.

## Architecture and environments

The application has two supported production build targets:

| Target | Command | Output and purpose |
| --- | --- | --- |
| OpenAI Sites / Cloudflare Worker | `npm run build` | Vinext/Vite output in `dist/`; retains the existing private Sites deployment path |
| Vercel | `npm run build:vercel` | Native Next.js output in `.next/`; Vercel CLI packages it as `.vercel/output` |

Both builds stamp `public/sw.js` with the same deterministic content hash and use the shared security policy in `src/config/securityHeaders.ts`. Gameplay remains local-first: there is no application database, account service, analytics service, or runtime secret.

The GitHub workflow `.github/workflows/vercel.yml` owns Vercel deployments:

1. A pull request runs the `verify` job.
2. A same-repository pull request that passes verification receives a Vercel Preview URL. Fork pull requests are verified but are not given deployment secrets.
3. A push to `main` that passes verification builds a Production artifact and deploys it with `--skip-domain`. This creates a staged Production URL without changing live traffic.
4. The workflow smoke-tests that exact staged deployment.
5. The `promote-production` job waits at the protected GitHub `production` Environment.
6. After a reviewer approves it, Vercel promotes the already-tested deployment without rebuilding it.

Failures or rejected approvals before step 6 leave the current production deployment untouched.

## Prerequisites

- Node.js 22.15 or newer and npm 10 or newer.
- Administrative access to `Goh-DYA/codex-hawker-game` on GitHub.
- A Vercel account allowed to create a project and token.
- GitHub CLI and Vercel CLI are optional; every required task also has dashboard instructions.

## One-time setup

### 1. Create and link the Vercel project

**User action — Vercel dashboard (recommended)**

1. Sign in at `https://vercel.com`.
2. Select **Add New > Project**.
3. Create a project named `hawker-simulator`. If that name is unavailable, use `hawker-simulator-gohdya`.
4. Set **Framework Preset** to **Next.js** and the root directory to `.`.
5. Do not connect Git-based automatic deployment. If the repository was imported, open **Project > Settings > Git** and select **Disconnect** after the project exists.
6. Confirm the project has a generated production domain such as `https://hawker-simulator.vercel.app`.

Expected result: the Vercel project exists, but Git pushes do not trigger Vercel directly.

CLI alternative:

```powershell
npx --yes vercel@55.0.0 login
npx --yes vercel@55.0.0 project add hawker-simulator
npx --yes vercel@55.0.0 link --yes --project hawker-simulator
npx --yes vercel@55.0.0 git disconnect --yes
Get-Content .vercel\project.json
```

Use `hawker-simulator-gohdya` in the two project commands if the preferred name is unavailable. `.vercel/` is ignored by Git and must remain uncommitted.

### 2. Create the Vercel access token and record IDs

**User action — Vercel dashboard**

1. Open the account menu and select **Account Settings > Tokens**. For a team-owned project, choose the correct team scope when creating the token.
2. Create a token named `github-actions-hawker-simulator`.
3. Copy it once into a password manager. Do not put it in `.env`, documentation, chat, or the repository.
4. Run the following commands
    ```powershell
    cd C:\Users\Adison\Documents\Github\codex-hawker-game
    npx.cmd --yes vercel@55.0.0 login

    npx --yes vercel@55.0.0 link --yes --project hawker-simulator
    Get-Content .vercel\project.json
    ```
5. Read `.vercel/project.json` after linking the project. Record `orgId` and `projectId`; never substitute the Sites `project_id` from `.openai/hosting.json`.

Expected result: you have three values ready for GitHub: the token, Vercel organization ID, and Vercel project ID.

### 3. Add GitHub Actions secrets and the production URL

**User action — GitHub dashboard**

1. Open **Repository > Settings > Secrets and variables > Actions**.
2. On **Secrets**, create:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
3. On **Variables**, create `VERCEL_PRODUCTION_URL` with the complete HTTPS origin and no trailing path, for example `https://hawker-simulator.vercel.app`.
4. Configure the automation bypass when Preview or staged deployments are protected:
   1. In Vercel, open the legacy `hawker-simulator` project and select **Settings > Deployment Protection**. The deployment identifier remains unchanged after the Hawker Balance rebrand.
   2. Check whether Vercel Authentication, Password Protection, or Trusted IPs applies to **Preview Deployments** or **All Deployments**. If none of these protections applies to the URLs tested by this workflow, skip the remaining substeps and do not create `VERCEL_AUTOMATION_BYPASS_SECRET`.
   3. Under **Protection Bypass for Automation**, create a dedicated bypass secret named for this workflow, such as `github-actions-hawker-simulator`.
   4. Copy the generated value when Vercel displays it. Treat it as a credential: do not put it in the repository, workflow YAML, issue comments, pull-request comments, screenshots, or command output.
   5. In GitHub, return to **Repository > Settings > Secrets and variables > Actions**, select **New repository secret**, enter `VERCEL_AUTOMATION_BYPASS_SECRET` as the exact name, paste the Vercel bypass value, and save it.
   6. Rerun the failed **Deploy Vercel preview** job. The smoke script reads this GitHub secret and sends it in the `x-vercel-protection-bypass` request header so the check reaches Hawker Balance instead of Vercel's authentication page.
   7. If the bypass value is regenerated or revoked in Vercel, replace the GitHub secret immediately and rerun the deployment workflow. Never keep an obsolete value as a second repository secret.

Expected result: repository settings display the required secret names and production variable without revealing their values. Protected projects also display `VERCEL_AUTOMATION_BYPASS_SECRET`, and a rerun of the Preview smoke check reaches the application shell rather than Vercel's protection page.

GitHub CLI alternative (each secret command reads the value securely from standard input):

```powershell
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
gh variable set VERCEL_PRODUCTION_URL --body "https://hawker-simulator.vercel.app"
```

If required:

```powershell
gh secret set VERCEL_AUTOMATION_BYPASS_SECRET
```

### 4. Protect production promotion

**User action — GitHub dashboard**

1. Open **Repository > Settings > Environments > New environment**.
2. Name it exactly `production`.
3. Enable **Required reviewers** and select the accountable production owner.
4. Do not allow administrators to bypass the protection unless the release policy explicitly permits emergency bypasses.

Expected result: the `promote-production` job pauses with a review request after staging and smoke checks pass.

GitHub CLI/API alternative for creating the Environment:

```powershell
gh api --method PUT repos/Goh-DYA/codex-hawker-game/environments/production
```

Use the dashboard to assign required reviewers; it is the clearest place to verify the effective protection policy.

### 5. Require the verification check on `main`

**User action — GitHub dashboard**

1. Open or update a pull request and wait for **Verify and deploy to Vercel** to finish at least once. GitHub only offers checks that it has already observed.
2. Open **Repository > Settings > Rules > Rulesets** and create or edit the ruleset that targets `main` (or the repository's default branch).
3. Enable **Require status checks to pass**.
4. Select **Add checks**, search for `verify`, and add the check produced by **GitHub Actions** for the **Verify and deploy to Vercel** workflow.
5. Confirm that the required `verify` check is associated with **GitHub Actions**, not the **Vercel** GitHub App. Vercel reports separate deployment checks and cannot satisfy the workflow's `verify` requirement.
6. If an existing `verify` requirement is associated with Vercel, remove it and add the GitHub Actions version again.
7. Enable **Require branches to be up to date before merging** only if that matches the repository's merge policy.
8. Save the ruleset, then reopen or refresh the pull request and confirm that the `verify` requirement is satisfied after the workflow passes.

Expected result: a pull request cannot merge while `verify` is pending or failing.

If every visible check is green but GitHub reports **Merging was blocked due to rule violation errors**, recheck the app associated with the required status check. This usually means the ruleset expects `verify` from Vercel while the successful `verify` check came from GitHub Actions.

CLI alternative for inspecting existing rules and checks:

```powershell
gh api repos/Goh-DYA/codex-hawker-game/rulesets
gh pr checks
```

Creating organization-specific rulesets is intentionally left to the dashboard because available enforcement settings depend on repository ownership and plan.

## Local verification

Use a clean checkout and the lockfile:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:ssr
npm run build:vercel
```

The combined Sites release gate is:

```powershell
npm run test:release
```

To smoke-test any accessible deployment:

```powershell
npm run smoke:deployment -- https://deployment-url.vercel.app
```

The smoke check verifies the rendered game shell, manifest, icon, social image, versioned service worker, security headers, and same-origin URL policy. Set `VERCEL_AUTOMATION_BYPASS_SECRET` only when testing a protected deployment.

## Routine deployment

### Pull request and Preview

1. Open or update a pull request.
2. Wait for `verify` and **Deploy Vercel preview**.
3. Open the Preview URL posted by the workflow bot.

**User action — Preview review**

- Complete the critical game path.
- Confirm save/reload, responsive layout, keyboard interaction, console state, network requests, and the intended offline checks.
- Record evidence using the template at the end of this document.
- Merge only when required checks pass and no critical/high issue remains.

Fork pull requests intentionally receive no Preview deployment because GitHub does not expose repository secrets to them.

### Staged Production and approval

After a merge or direct push to `main`, the workflow verifies the commit, builds with Production settings, and produces a staged URL. It does not alter the generated production domain yet.

**User action — staged review**

1. Open the workflow run and select **Stage Vercel production**.
2. Open the URL in its job summary and confirm it matches the intended commit.
3. Repeat the required exact-artifact browser and offline checks.
4. Open the waiting **Approve and promote Vercel production** job.
5. Select **Approve and deploy** only if the release checklist records GO; otherwise select **Reject** and document the blocker.

Expected result after approval: Vercel assigns the configured production domain to the already-tested staged deployment, and the workflow smoke-tests that origin.

## Failure handling

| Failure | Meaning and response |
| --- | --- |
| `verify` fails | Open the failed command log, fix the source or test, and push a new commit. No deployment occurs. |
| Missing `VERCEL_*` value | Add or correct the named GitHub secret/variable, then rerun failed jobs. Do not print values while troubleshooting. |
| Token is expired or revoked | Rotate the token in Vercel and replace `VERCEL_TOKEN` in GitHub. Do not create a second long-lived token without revoking the old one. |
| Project name unavailable | Use `hawker-simulator-gohdya`, relink locally, and update the GitHub IDs and production URL. |
| Vercel build fails | Inspect **Stage/Preview job > Build the immutable artifact** and Vercel **Project > Deployments > failed deployment > Build Logs**. |
| Smoke check fails | Do not promote. Inspect the exact URL, headers, manifest, assets, and service worker; fix and rebuild from a new commit. |
| Production approval rejected | The staged deployment remains non-current and the existing production domain is unchanged. Create a new run after resolving the reason. |
| Promotion fails | Leave the prior production deployment in place, inspect Vercel activity/logs, correct permissions or configuration, and rerun only the failed job. |

Useful inspection commands:

```powershell
npx --yes vercel@55.0.0 inspect https://deployment-url.vercel.app --logs
npx --yes vercel@55.0.0 logs --deployment https://deployment-url.vercel.app --level error
npx --yes vercel@55.0.0 promote status
```

## Rollback

Rollback changes which immutable deployment the production domain points to. It must not clear browser storage, delete IndexedDB, or run save migrations.

**User action — rollback decision**

1. Stop further promotions and preserve the failed deployment URL and logs.
2. Select the most recent known-good deployment that can read the current save schema.
3. In Vercel, open **Project > Deployments**, open the deployment menu, and choose **Instant Rollback** or **Promote** as appropriate.
4. Run the deployment smoke check against the production domain.
5. Verify launch, existing save load, offline reload, and update behavior.
6. Record the incident and rollback deployment in the release evidence.

CLI alternative:

```powershell
npx --yes vercel@55.0.0 rollback https://known-good-deployment.vercel.app
npm run smoke:deployment -- https://hawker-simulator.vercel.app
```

If a forward save migration is irreversible, do not roll back blindly. Ship a repaired forward build or a tested reverse adapter.

## Credential rotation

**User action — rotate the Vercel token**

1. Create a replacement token in Vercel.
2. Replace `VERCEL_TOKEN` in **GitHub > Settings > Secrets and variables > Actions** or run `gh secret set VERCEL_TOKEN`.
3. Rerun a Preview deployment and confirm it succeeds.
4. Revoke the old token in Vercel.

Project and organization IDs change only when the deployment is moved to another project or team. Update both GitHub secrets together with the production URL when that happens.

## Disable the pipeline safely

**User action — GitHub dashboard**

Open **Repository > Actions > Verify and deploy to Vercel > ... > Disable workflow**. This stops new builds and promotions but does not delete Vercel deployments or change the current production domain.

CLI alternative:

```powershell
gh workflow disable vercel.yml
```

Re-enable it with `gh workflow enable vercel.yml`. Do not delete the Vercel project as a way to pause deployments.

## Release evidence template

Copy this block into the release record and replace every placeholder with observed evidence:

```markdown
## Vercel release evidence

- Commit SHA:
- GitHub workflow URL:
- Pull request URL:
- Preview deployment URL:
- Staged Production URL:
- Promoted production URL:
- Service-worker build ID:
- Vercel project and environment:
- Browser / OS / viewport / zoom:
- Critical-path result:
- Save and reload result:
- Offline reload / restart / update result:
- Console and network findings:
- Accessibility smoke result:
- Performance smoke result:
- Security-header smoke result:
- Approval decision and approver:
- Promotion timestamp and timezone:
- Previous known-good rollback URL:
- Rollback rehearsal result:
- Open blockers or waivers:
```

Do not translate a successful build, deployment, or automated smoke check into production approval. `docs/RELEASE_CHECKLIST.md` remains the authority for GO/NO-GO.
