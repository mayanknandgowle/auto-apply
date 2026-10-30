# Internal alpha release checklist

Version 0.2.1 remains a local internal build. Store publication and real employer applications require separate owner action.

- [x] Source, pinned dependencies, lockfile and CI workflow.
- [x] Strict models, serialized writes, bounded document/provider operations and explicit action authority.
- [x] Saved/session modes, backup preview/restore, migration, passphrase rewrap and recovery UI.
- [x] Source/original preservation, reviewed derivatives and honest capability labels.
- [x] Synthetic browser harness and unit/security/domain tests.
- [x] Updated installation, privacy, security, requirement and support documentation.
- [x] Final 0.2.1 checks recorded in VERIFICATION.md: 86 local unit tests, 51/51 full Linux CI browser scenarios, two post-fix Windows recovery regressions, two installed-Edge smoke scenarios, both builds and package integrity. Interactive browser sign-off remains separate below.
- [ ] Installed Chrome/Edge toolbar, side-panel, host-consent and minimum-version checks.
- [ ] Live provider connection/structured-output/quality evaluation with synthetic data and local credentials.
- [ ] Named ATS normal-flow/upload acceptance and terminal-boundary validation.
- [ ] Full human-reviewed 200-question/30-pair evaluation, measured correctness/coverage, performance distributions and pilot.
- [ ] Manual keyboard/zoom/screen-reader accessibility and complete document rendering/accessibility gates.
- [ ] Publisher identity/contact, approved branding, store screenshots and data-use declarations.
- [ ] Independent security and dependency-distribution/license review.

## Updating and rollback

Export an encrypted backup before updating saved-profile data; keep the passphrase and original documents separately. Lock/pause before loading another build. Schema 1 upgrades to schema 2. Older binaries cannot be assumed to read new saved state. A rollback requires the corresponding prior binary and a compatible backup; no downgrade migration is promised. Session-only data intentionally becomes unusable after reload/restart.

Keep the prior ZIP and its hash with release notes. Never distribute `.output/chrome-test`, browser profiles, traces, candidate data or credentials. Inspect the final manifest/archive. Public store text must clearly disclose exact-origin optional API access, local encrypted storage, optional provider transfers, native file-attachment behavior and the absence of automated submission.
