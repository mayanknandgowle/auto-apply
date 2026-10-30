# Support matrix

30 October 2026 · 0.2.1 internal alpha. Fixture-tested means synthetic local pages. See [verification](VERIFICATION.md) and [requirement dispositions](CONTINUATION_CHECKLIST.md).

| Capability | Implemented boundary | Fallback / remaining gate |
| --- | --- | --- |
| Chrome/Edge MV3 | Bundled trusted panel, serialized worker, isolated top-frame driver | Actual toolbar/side-panel, permission prompt and minimum-version sign-off pending |
| Native filling | Exact contact labels/options, empty inputs/selects, React setters, conditional undo | Ambiguous, duplicate and existing entries stay manual |
| Radio/checkbox | User-approved individual options with exact group context; preserves existing selections | No legal terms/attestations, automatic unchecked answers, unchecking, ambiguous groups or multi-select native selects |
| Disabled/validation | Read-only display of disabled controls and native/ARIA invalid state | No forced enable; site-specific remote errors not interpreted |
| Open shadow roots | Native labeled controls in bounded traversal, visible-host checks | Closed roots, custom widgets, canvas and all frames remain manual |
| Repeated sections | Section-context labels and individual explicit answers | No row creation, deduplication across dynamic row variants or automatic career-record mapping |
| Lever hosted form | Experimental `lever-hosted-v1`, locally disableable; one public structure observed and sanitized fixture tested | Live writes/uploads unvalidated; no claim for all tenants, EU/custom hosts or every widget |
| Navigation/submission | Entirely user-controlled | No click, Next or Submit command; observed application had no nonterminal transition |
| Job context | Separate quoted sources, capture metadata, explicit/uncertain labeled facts and conflict review | Arbitrary job layouts and inferred metadata stay manual; pasted sources are never labeled employer-verified |
| Decisions | Exact questions/options, approve/edit/defer/unknown, English/Hindi help, scoped memory | No inferred legal/financial answers; semantic AI evaluation pending |
| Profile | Contacts/links, career records, certifications, languages, preferences, compensation, notice, availability and country authorization | Skills still simple strings; no skill-year inference or currency/grade conversion |
| Imports | Local PDF/DOCX/contact intake and explicit labeled employment/education blocks, review/merge/rollback/source excerpts | General unstructured extraction and direct Naukri/Indeed imports unavailable |
| Storage | Encrypted session/saved profile, lock, expiry, rewrap, backup preview/restore | Passphrase recovery unavailable; unlocked-device compromise outside boundary |
| Resume assessment | Selected-resume evidence, versioned weighted coverage, duplicate suppression, explicit blockers | Not ATS score or hiring prediction; human semantic evaluation required |
| Improvements | Source/evidence-linked formatting proposals and honest gap/confirmation states | No automatic invented claims; factual changes need supporting facts and individual approval |
| Documents | Immutable originals, reviewed PDF/DOCX derivatives and exact normalized reparse | No arbitrary-layout preservation, OCR, tagged PDF or complex-script PDF shaping; office layout evidence scoped in verification |
| Uploads | Explicit empty labeled native input, hash/type/accept/local-size checks, durable attempt and no retry after reload | Actual hosted widgets, observed site-size limits and server processing require manual checks |
| Recovery/receipts | Explicit same-origin cross-step journal, reload/worker reconciliation, step-aware receipts, retention/deletion | Cross-origin continuation unsupported; prepared/local/user-reported outcomes never imply server acceptance |
| Providers | Gemini/OpenAI/custom protocol and binding checks, post-permission revalidation, cancellation and bounds | Mocked checks only; no live connectivity/model-quality validation |
| Accessibility | Labeled native UI, visible focus and automated axe in tested review states | Full keyboard/zoom/screen-reader and document accessibility audits pending |

Release permissions are unchanged: no unconditional hosts, no cookies/history/debugger permission. Test-only grants for loopback and a locally intercepted Lever hostname must never be distributed.
