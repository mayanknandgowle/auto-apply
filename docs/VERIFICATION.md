# Verification report — 30 October 2026

Scope: **0.2.1 internal alpha**, synthetic applicant data. This is a narrow Milestone 3 coverage/recovery slice; Milestones 0–3 are not fully complete. The previous report is preserved in [archive/VERIFICATION-0.2.0.md](archive/VERIFICATION-0.2.0.md). Requirement dispositions are in [CONTINUATION_CHECKLIST.md](CONTINUATION_CHECKLIST.md).

## Environment and final checks

Windows x64; Node 24.15.0; pnpm 11.25.0; WXT 0.21.5; TypeScript 7.0.2; Playwright 1.64.1. Bundled Chromium reports HeadlessChrome/156.0.0.0. Installed Edge executable is 156.0.4314.50. Isolated profiles and synthetic files were used; no real applicant values or provider keys were supplied.

| Check | Observed result |
| --- | --- |
| Type checking | Passed |
| Unit tests | 86 passed across 6 files |
| Chrome MV3 / Edge MV3 builds | Passed |
| Bundle checks | Manifest, permission, CSP, remote-script and embedded-key checks passed |
| ZIP package | 15 files, 1,337,734 bytes; version 0.2.1; every archive file matches the release directory and all 14 non-manifest release files match the test copy |
| Production dependency audit | No known vulnerabilities reported on 30 October 2026; not a complete security review |
| Full local Chromium integration suite | 49/51 passed in 11.5 minutes before the inspection revision-race fix; the two failures are explained below |
| Post-fix local browser regressions | Both failed recovery scenarios pass (2/2, 1.4 minutes), including wrong-application and stale-write rejection; zero retries |
| Installed Edge smoke tests | 2/2 passed in 58.5 seconds, zero retries: normal native/dependent filling with no navigation, and sensitive-answer retention/receipt exclusion |
| Accessibility | Automated axe checks cover tested Apply/Profile/Resume/Settings and review states; manual audit remains open |
| DOCX office layout | Unverified: packaged renderer cannot locate LibreOffice. Word 16.0.19328.20190 is installed but native control could not activate its minimized window. Text reparse is tested separately. |
| Live providers | Not run: no locally supplied credentials and provider-specific paid-use authorization established |
| Live ATS | One public Lever application structure observed read-only in installed Edge; no filling, attachment or submission |

ZIP SHA-256: `895575d6f40db1fc634984f217db44f51a2306c8990cd8efca800a34aeeb930e`. Local ZIPs, browser profiles, traces and generated applicant artifacts are ignored and excluded from source commits.

## Baseline and failure investigation

The starting checkout was clean at `c09d276`. Its typecheck, 66 units, builds, bundle and ZIP checks passed locally. Its browser baseline passed 43 of 44 scenarios: the wrong-tab test received a stale-revision error before the more actionable tab-binding error. The coordinator now checks the bound tab first.

Read the [latest pre-change successful CI run](https://github.com/mayanknandgowle/auto-apply/actions/runs/40846753448) and [preceding failed run](https://github.com/mayanknandgowle/auto-apply/actions/runs/40846332796). The failed job log showed the worker-termination test expecting a last-name write after interruption. Its first DOM observation did not establish a durable completed checkpoint; interruption could leave the next intent uncertain. The test now stops after assist mode explicitly confirms a durable one-field checkpoint. A separate failure-injected test verifies that an uncertain write stays blocked across worker restart and document reload. No retries, explicit skips or weakened terminal assertions were introduced.

An intermediate 50-scenario run passed 49 and timed out waiting for an encrypted-backup download. Trace inspection showed the export click was delivered, with no captured application exception; the exact cause was not established. About 0.5 GB free memory was observed during that run, which is context rather than a proven cause. The isolated unchanged backup test then passed in 11.3 seconds. Final-suite results are recorded above rather than discarding this failure history.

The first installed-Edge attempt loaded the worker but failed before tests: its Fluent Developer mode switch differs from Chromium's accessible switch. The harness now checks the rendered Edge control's checked property. The next attempt passed sensitive-answer consent but found that the fixed footer could intercept the main action after scrolling. Controls now reserve scroll space for the sticky navigation and fixed footer; no forced clicks were added.

The subsequent 51-scenario local run passed 49, including the previously failing backup. Two new recovery scenarios exposed a navigation/refresh race: the worker had paused on navigation before the panel received the latest revision, so inspection was rejected as stale. Read-only inspection now uses the latest serialized state; continuation additionally requires the intended application ID. Page writes still require the exact revision. Regression assertions explicitly reject a different application ID and a stale write while allowing a stale read-only inspection. The final complete CI run is recorded separately.

## Test boundary and covered behavior

The production extension is copied into `.output/chrome-test`. Only its test manifest receives host grants for loopback and `https://jobs.lever.co/*`; the Lever scenario intercepts and locally fulfills all requests for its sanitized fixture. The release manifest has no unconditional host permissions. The package check compares all 14 non-manifest release files with this test copy when present; byte identity alone does not establish a passing test run.

The panel HTML is opened in an extension tab. Installed-Edge smoke tests do not prove actual toolbar gestures, temporary activeTab grants, side-panel placement, optional-origin prompts, Chrome installation or Chromium 142 compatibility. Those interactive gates remain in the continuation checklist.

Coverage includes encrypted vault/backup/restart behavior, contact and career imports with rollback, source conflicts and preservation, profile provenance, scoped answers, document generation/reparse, local uploads, review choices, navigation/tab/permission interruptions and terminal counters. New cases cover explicit same-origin step journals, reload/worker uncertainty without retry, deferred/unknown decisions, reviewed native radio/checkbox groups, open shadow roots, the sanitized Lever structure and its disable switch, and sensitive-answer retention. Unit checks also cover provider configuration changes during asynchronous permission checks, exact numbers/evidence, labeled import ambiguity and capacity preservation.

Recognized answered sensitive fields are omitted from captured controls. AI drafting excludes recognized sensitive questions; approving a user-provided answer requires explicit journal retention. Such answers are excluded from receipts. Keyword recognition does not guarantee that arbitrary free text contains no sensitive content.

Generated PDF/DOCX text is reparsed against approved text. Synthetic long-content and glyph-boundary regressions run in the browser. Current one-page and all three long-content PDF preview pages were visually inspected: readable text, consistent margins and no observed clipping or overlap. This is a synthetic template check, not arbitrary resume-layout certification. DOCX office pagination, tagged PDF, broader script shaping, full keyboard/zoom/screen-reader review and independent security review remain open.

See [ATS_EVIDENCE.md](ATS_EVIDENCE.md) for the exact observed hostname, structure and unsupported widgets. Public read-only observation and intercepted fixtures do not establish live upload processing, all Lever tenants or real application success. No account creation, message, CAPTCHA interaction, paid provider request, real submission or browser-store publication was performed.

## Remote verification

The reviewed continuation will be pushed to the existing repository after local checks. The new CI outcome will be linked here when available.
