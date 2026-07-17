# Security and Privacy Plan

Status: Internal controls implemented and automatically checked; independent security and qualified legal/privacy review pending

## Data posture

The 1.0 game has no accounts, backend gameplay service, cloud save, advertising, payments, analytics, chat, or third-party trackers. Game state and preferences remain in browser-owned IndexedDB. The app should make no network request after the initial same-origin application load except user-initiated external support links.

No player name is required. If a centre name is supported, store plain text locally, limit length, normalize control characters, and render through React text nodes—never as HTML.

Nutrition source CSVs are build-time operator inputs only. Raw files, machine-specific paths, and source data are not read by the browser or included in player saves. Generated profiles contain bounded numeric values and provenance hashes, and use the same schema validation and import-size protections as other launch content.

The public-facing notice is PRIVACY.md. It describes behavior, not legal compliance.

## Threat model

Protected assets: save integrity, player expectations of local privacy, build/dependency integrity, and availability of the offline shell.

Primary threats:

- script injection through player-entered or imported save text;
- malicious/tampered save import causing resource exhaustion or invalid state;
- compromised dependency or unexpected remote asset;
- secret/environment leakage into client bundles or service-worker caches;
- cache poisoning or mixed code/content versions;
- unsafe external navigation and reverse-tabnabbing;
- destructive reset or migration data loss;
- clickjacking where hosting context does not require embedding.

There is no server authorization boundary in the 1.0 design. Save editing is not treated as cheating or a security incident; it must only fail safely.

## Required controls

- Runtime-validate content and imported saves; cap file size, array counts, string lengths, map dimensions, and numeric ranges.
- Never evaluate content, use dangerous HTML insertion, or construct script/style URLs from save data.
- Same-origin packaged assets only for core play; pin dependencies and review lockfile changes.
- Scan source and built output for credentials, source environment values, remote URLs, and source maps.
- Atomic save plus backup and tested migrations; confirmation for reset/import replacement.
- External links use an allowlist, clear destination, noopener/noreferrer, and no automatic redirects.
- Service worker accepts only expected same-origin requests and uses versioned immutable cache keys.
- HTTPS-only production hosting.
- Debug mutation tools disabled in production.

## Target headers

Validate a production-compatible policy before enforcement:

    Content-Security-Policy:
      default-src 'self';
      script-src 'self';
      style-src 'self';
      img-src 'self' data: blob:;
      media-src 'self';
      connect-src 'self';
      worker-src 'self' blob:;
      object-src 'none';
      base-uri 'none';
      form-action 'none';
      frame-ancestors 'none';
      manifest-src 'self';

Also target:

- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer
- Permissions-Policy disabling camera, microphone, geolocation, payment, and other unused capabilities
- Strict-Transport-Security after HTTPS/host validation
- Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy only after Sites/runtime compatibility testing

Avoid unsafe-eval and unsafe-inline. If the framework build cannot meet that initially, document the narrow exception, use report-only evaluation, and create a removal task. Reference: [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

## Dependency and release checks

- npm ci from the lockfile on a clean workspace.
- npm audit or an approved equivalent, with each finding triaged for reachable production impact.
- License inventory and full license texts where distribution requires them.
- Secret scan over source, history where available, and production bundle.
- CSP console inspection and network-request audit.
- Malformed import fuzz cases and large-data limits.
- Restore from current, backup, interrupted migration, and quota failure.

Automated audit output is evidence, not a complete security review.

## Young audience and legal caution

The product targets ages 13+ but intentionally avoids collecting personal information. If analytics, accounts, social features, payments, or remote support intake are proposed later, stop and perform a new data-protection impact assessment and consent/legal review before implementation. Singapore PDPC publishes [guidance on children’s personal data in the digital environment](https://www.pdpc.gov.sg/guidelines-and-consultation/2024/03/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment).

No claim of PDPA, COPPA, GDPR, consumer-law, accessibility-law, or other legal compliance is made. Qualified review remains a release gate.
