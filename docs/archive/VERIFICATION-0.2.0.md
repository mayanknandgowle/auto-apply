# Verification report — 29 October 2026

Scope: **0.2.0 internal alpha**, local synthetic data. The previous report is preserved in `archive/VERIFICATION-0.1.0.md`. These results do not establish production readiness or live ATS/provider support.

## Environment and results

Windows x64; Node 24.15.0; pnpm 11.25.0; WXT 0.21.5; TypeScript 7.0.2; Playwright 1.64.1. Actual browser user agent reports `HeadlessChrome/156.0.0.0`, using an isolated persistent test profile. No real applicant data or developer API key was used.

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | 66 tests passed across 5 files |
| `pnpm build` | Chrome MV3 release build passed |
| `pnpm check:bundle` | Manifest, permissions, CSP, remote script tags and embedded-key checks passed |
| `pnpm build:edge` | Edge build passed; no installed Edge runtime certification |
| `pnpm zip` | 15 release files; manifest version 0.2.0; no test fixtures, development server, browser profiles or candidate data |
| `pnpm audit --prod` | No known vulnerabilities found on this date; not a complete security audit |
| Chromium integration suite | All 44 scenarios passed in 2.6 minutes; zero retries, skips or expected failures |
| Automated accessibility | Apply-view tagged WCAG checks and default axe checks of Profile, Resume and Settings pass in their tested states |
| PDF rendering | Generated single-page and three-page fixtures visually inspected; readable text, consistent margins and no observed clipping/overlap |
| DOCX generation | Reparsed text matches approved text; office-engine visual rendering remains unverified |
| Live providers / real ATS applications | Not run; no paid requests or applications submitted |

## Browser harness boundary

The production JavaScript is copied into a separate test extension. Its test-only manifest adds `http://127.0.0.1:4177/*` to substitute for the toolbar gesture's temporary page grant. The release manifest has no unconditional hosts; its optional HTTPS declaration allows exact-origin provider grants. The fixture server binds only to loopback.

After the final run, SHA-256 comparisons confirmed that all 14 non-manifest release files match the browser-tested extension.

The panel HTML is tested in an extension tab. This does **not** prove actual side-panel placement, installed-browser toolbar grants, optional-permission prompts or Chromium 142 compatibility. Local document imports observe no HTTP(S) requests. Attachment tests exercise local native file inputs and synthetic behavior, not an employer's server acceptance.

## Covered workflows

- Saved vault creation, lock/unlock, wrong-passphrase rejection, browser restart, idle expiry, corrupt-data recovery without reset, and preview-bound encrypted backup restoration.
- Structured employment/education records, reviewed contact import, conditional rollback that preserves later edits, scoped answer reuse and expiry rules.
- Reviewed PDF/DOCX derivatives, immutable original bytes, exact normalized text reparse, unsupported-number rejection, unsupported PDF glyph/long-word rejection, actual PDF preview rendering and multipage pagination.
- Evidence assessment with exact selected-resume quotes, coverage suppression, job-change invalidation and separate eligibility handling.
- Provider consent/configuration, destination changes clearing entered keys, and clearing unsaved private text when ending a session.
- Explicit native attachment with exact byte/hash checks, incompatible-format rejection, existing-file preservation, uncertainty and no automatic retry.
- Preparation versus user-reported submission receipts; no navigation or submission command.
- Inspection without mutation; native contact/dependent inputs and selects; real React controlled-state rerender; preservation and safe undo; duplicate/contextual labels; stale options; hidden, password and OTP exclusions.
- Mid-write validation failures, ignored events, replaced controls and user corrections pause safely. Page instructions cannot authorize actions. Content scripts cannot access trusted keys or panel commands.
- Manual multipage flow, disguised terminal controls left untouched, wrong-tab binding, panel reconnect, worker recovery, browser restart and extension reload.

Unit tests cover strict commands and sender boundaries, action/revision/document bindings, expiry/replay rejection, encryption and authenticated metadata, migration, passphrase rewrap, backup preview/restore, source-deletion rollback boundaries, date/experience/compensation calculations, exact memory scope, scoring, edit constraints, and provider URL/schema/response/redirect/error handling. Mocked transport tests do not prove live provider availability or semantic answer quality.

## Issues resolved during this milestone

- Reused React keys caused duplicate review panels; component keys now include unique component prefixes and the privacy-reset epoch.
- Unlabeled or overbroad form labels confused accessibility and automation; explicit labels and landmarks were added.
- Contact typing could race a pending import response; contact editing is disabled while the operation is committing.
- PDF previews lacked local standard-font assets; the extension now bundles the required fonts and checks rendered text content.
- Saved-vault unlock now resets the per-session AI-request budget while preserving encrypted profile data.
- Updated import assertions distinguish the original document from the selected artifact. The test launcher also crashed once before execution and left a loopback fixture process; that verified process was stopped before the clean rerun. No scenario was removed to obtain a passing result.

## Remaining release gates

Installed Chrome/Edge toolbar, side-panel, permission prompts and minimum-version smoke tests remain open. Automated axe results do not certify all dialog/error states, keyboard navigation, zoom or screen-reader behavior. DOCX needs Word/LibreOffice layout inspection; PDF accessibility tagging and broader multilingual shaping remain unimplemented.

The suite contains more than 40 scenarios, but does not constitute 40 independently validated ATS variants. Named ATS adapters, server upload-acceptance evidence, safe nonterminal progression, repeated/custom controls and guarded submission remain separate implementation gates. The 200-question/30-resume-JD human-reviewed corpus, live-provider quality evaluation, performance distributions and usability pilot are incomplete. No 98% correctness, application-time or effort-reduction claim is made.

Dependency inventory is in `DEPENDENCIES.json`; bundled notices are in `public/THIRD_PARTY_NOTICES.txt`. Some dependencies declare licenses without a root license file. Independent security and distribution/license review remain public-release gates. See `IMPLEMENTATION_STATUS.md` for the remaining work in dependency order.

## Artifacts and reproduction

- Chrome unpacked build: `.output/chrome-mv3`.
- Edge unpacked build: `.output/edge-mv3`.
- Release archive: `.output/applypilot-0.2.0-chrome.zip`.
- Archive size: **1,326,643 bytes**.
- SHA-256: `c6792052a579d38c907fbbbd4a2b4fcf600539e4b4c63153c52d284f3f5bd749`.
- Generated browser report: `playwright-report/index.html`.
- Synthetic UI capture: `docs/screenshots/application.png`.
- Generated document fixtures and page images: `test-results/generated-resume.pdf`, `generated-resume.docx`, `generated-resume-preview.png`, `long-resume.pdf` and `long-resume-page-1.png` through `long-resume-page-3.png`. These are local QA outputs, not user documents.

Run `pnpm check`, `pnpm test:e2e`, `pnpm build:edge`, then `pnpm zip`. Keep Developer mode enabled for unpacked installation. Never install or distribute `.output/chrome-test` or browser test profiles.

Primary API references: [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Playwright extension tests](https://playwright.dev/docs/chrome-extensions), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [pdf-lib](https://pdf-lib.js.org/) and [docx](https://docx.js.org/). Documentation establishes contracts; observed results and limits are stated above.
