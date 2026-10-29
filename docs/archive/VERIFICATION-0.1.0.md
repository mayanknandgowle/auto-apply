# Verification report — 29 October 2026

Scope: **0.1.0 internal alpha**, local synthetic data only. This report does not establish production readiness or live ATS/provider support.

## Environment

- Windows x64; Node 24.15.0; pnpm 11.25.0.
- WXT 0.21.5; Vite 8.3.5; TypeScript 7.0.2; Playwright 1.64.1.
- Actual browser user agent: `HeadlessChrome/156.0.0.0` in a dedicated persistent Chromium test profile.
- No developer API key or real applicant data used.

## Results

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | 35 tests passed across 3 files |
| `pnpm build` | Chrome MV3 release build passed |
| `pnpm check:bundle` | Manifest/CSP/permission/remote-script-tag/key-pattern checks passed |
| `pnpm build:edge` | Edge MV3 build passed; not a manual Edge runtime check |
| `pnpm zip` | Archive created; 10 release files; no tests, development server or candidate data in archive |
| `pnpm audit --prod` | “No known vulnerabilities found” on this date; not a complete security audit |
| Chromium integration suite | All 20 scenarios passed in 1.4 minutes; zero retries, skips or expected failures |
| Core Apply-view axe audit | No violations of enabled WCAG 2 A/AA, 2.1 AA and 2.2 AA automated rules in the tested state |
| Live Gemini requests | Not run; no key supplied or billed request made |
| Real employer/ATS applications | Not run; none submitted |

## What the browser suite exercises

The actual production JavaScript is copied into a separate test extension. Only its test manifest adds `http://127.0.0.1:4177/*`, substituting for the user toolbar gesture's temporary host grant. The release manifest has no unconditional hosts. The panel HTML is exercised in a normal extension tab, so this suite does **not** prove actual side-panel placement or toolbar grant behavior.

The fixture server binds only to loopback. Tests use a synthetic employer, synthetic profile, synthetic PDF/DOCX and synthetic upload endpoint. Documents parse with bundled workers under the release CSP; the import tests observe no HTTP(S) network requests.

Covered paths:

- Inspection performs no mutation; six contact/dependent fields fill and verify on a native form.
- Hidden, offscreen honeypot, password and OTP fields remain untouched.
- Native select options are matched exactly; option changes invalidate approvals.
- Duplicate labels abstain; another person's details and legal-country contexts do not receive ordinary contact facts.
- Existing user values survive; changed values block undo; reverting an unchanged required field works.
- Ignored events, validation failures, replacement DOM nodes and mid-write user corrections pause instead of reporting success.
- A real React controlled form updates its React state and retains values after rerender.
- Three manual application steps complete with approved narrative/select answers and a manual file upload. The extension leaves the final “Continue” submit control and attestation untouched.
- Panel close/reopen, pause, and wrong-tab binding preserve scope and profile state.
- Website text containing malicious instructions cannot grant authority.
- Actual injected content scripts cannot access the session key or issue trusted panel commands.
- Worker termination retains recoverable state; a fresh inspection reconciles before continuing.
- An actual browser-process restart loses usable session data despite reusing the same browser profile directory.
- An actual extension reload closes its panel and removes usable session-only profile data.
- Local simple PDF/DOCX text intake, explicit contact-import review, corrupt signature rejection and empty-text rejection.

Unit tests cover the action vocabulary, exact mapping/abstention, length limits, sender authority, unknown commands, generation/document/snapshot binding, replay/expiry/pause rejection, fingerprint changes, AES-GCM nonce/authenticated-metadata behavior, repository revision checks, session key loss/deletion, provider fixed-origin/header/redirect behavior, no rate-limit retry, and evidence ID/exact-quote checks.

## Defects found and resolved during verification

- Nested select labels initially included option text. Label extraction now excludes descendant controls.
- Chrome supplies `sender.tab` when the trusted extension UI is opened in a tab. Sender validation now checks actual extension URL and origin while still rejecting employer-page content scripts.
- Required-field undo was initially treated as invalid because the restored empty field was required. Undo now verifies the restored value without pretending the form is valid.
- A worker restart can disconnect a still-open panel port. The panel now reconnects, and the coordinator pauses/reconciles interrupted filling.
- Automated contrast checks identified muted navigation/eyebrow/step labels. These colors were darkened and the audit passed.
- The React test fixture initially retained a Node environment reference; its browser bundle now explicitly uses the production React environment.
- The reload harness initially failed because Chromium disabled the unpacked extension when Developer mode was off. The harness now enables Developer mode through the extensions UI, matching README installation instructions. It separately reopens the panel that Chrome closes on reload. No test was skipped or hidden to obtain the passing 20-scenario result.

## Limits and remaining gates

Actual installed Chrome/Edge toolbar/side-panel/optional-permission smoke checks and the declared Chromium 142 minimum are unverified. The core Apply-view automated accessibility result is not a full keyboard, zoom, screen-reader, or whole-product accessibility certification. PDF parsing is not visual resume-layout validation or an accessible-output certification.

The 40+ fixture target, 200-question/30-resume-JD human-reviewed corpus, live Gemini/model-quality tests, performance distributions, field-correctness/coverage benchmark, and usability pilot are not complete. No fixed application-time, 98% correctness, or effort-reduction claim is made.

Dependency inventory is in `DEPENDENCIES.json`; bundled notices are in `public/THIRD_PARTY_NOTICES.txt`. Some packages declare a license without shipping a root license file; complete distribution/license review remains a public-release gate.

## Artifacts and reproduction

- Chrome unpacked: `.output/chrome-mv3`.
- Edge unpacked: `.output/edge-mv3`.
- Archive: `.output/applypilot-0.1.0-chrome.zip`.
- Archive size: 879,098 bytes. SHA-256: `7da2046f511c8d7e1285401bec19f340e9503163261f7b387236f4033139a6c4`.
- Chromium HTML report: `playwright-report/index.html` (local, generated).
- Actual synthetic-data UI capture: `docs/screenshots/application.png`.

Run `pnpm check`, then `pnpm test:e2e`, then `pnpm build:edge` and `pnpm zip`. Keep Developer mode enabled when loading unpacked builds. Do not use `.output/chrome-test` for the user-facing install.

Primary documentation used to verify platform choices: [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints), [Chrome session storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Playwright extension testing](https://playwright.dev/docs/chrome-extensions), and [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Documentation establishes API contracts; the test results above state what was actually observed.
