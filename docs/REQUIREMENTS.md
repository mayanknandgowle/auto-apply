# Requirement-to-evidence checklist

The original 25 acceptance scenarios remain the release contract. Partial scope stays explicit. Tests live in `tests/unit` and `tests/e2e/extension.spec.ts`; final counts/results are recorded in VERIFICATION.md.

| ID | Acceptance scenario | Evidence / remaining gap |
| --- | --- | --- |
| 1 | Fresh graduate | Separate education/projects/internships, no employment invented; broader extraction pending |
| 2 | Manual setup | Profile and deterministic native filling without AI |
| 3 | Naukri/Indeed import | Local PDF/DOCX/paste contact review; direct imports unvalidated |
| 4 | Conflicting notice period | Structured unknown/known/declined notice model; contact merge rollback; full notice-source merge pending |
| 5 | Salary context | Currency/period/basis/gross-net model and conversion invariants; ambiguous site wording stays manual |
| 6 | Sponsorship distinction | Separate current permission/future sponsorship by country; exact explicit website choice |
| 7 | Confusing wording | Original question/options and English/Hindi explanations; evaluated AI interpretation pending |
| 8 | Evidence-backed narrative | Quote/ID validation and explicit review; live semantic-grounding evaluation pending |
| 9 | Score honesty | Selected-resume excerpts, weighted coverage, duplicate normalization and total suppression; user-reviewed rubric |
| 10 | Resume improvement | Individual before/after approvals, source checks for added numbers, local generated derivatives; automatic edit suggestions limited to whitespace cleanup |
| 11 | Original preservation | Immutable original, source/job/profile lineage, selected derivative, exact original-byte download check |
| 12 | Document rejection | Local corrupt/empty/glyph/long-word rejection; native attachment rejection becomes uncertain; remote acceptance unverified |
| 13 | Dynamic form | Dependent native controls and per-write rescan |
| 14 | User correction | Preserve existing values/files, pause on correction, conditional undo/rollback |
| 15 | Origin transition | Exact tab/URL boundary; user invokes toolbar again; cross-origin automation pending |
| 16 | Wrong tab | Unrelated page receives no writes |
| 17 | Interrupt recovery | Worker termination reconciliation and durable attachment intent; repeated-row protocol pending |
| 18 | Manual step | Authentication exclusions and manual CAPTCHA/login handoff |
| 19 | Default submission boundary | No click/submit command; terminal Continue and attestations untouched |
| 20 | Authorized submission | Unavailable until validated normal-flow/terminal adapter prerequisites pass |
| 21 | Uncertain submission | Submission unavailable; no remote retry guarantee claimed |
| 22 | Hostile content | Untrusted page/model text cannot authorize actions; sender/key-isolation tests; broader adversarial corpus pending |
| 23 | Session privacy | Session key loss; saved lock/restart/expiry/backup/rewrap/tamper/deletion checks |
| 24 | Provider outage | Gemini/OpenAI/custom bounded protocol tests, no retries/fallback, deterministic filling independent of AI; live probes pending |
| 25 | Receipt | Prepared versus user-reported status, selected artifact and attachment attempt evidence, export/deletion/retention; complete cross-step receipt still pending |

Milestones are detailed in IMPLEMENTATION_STATUS.md. Synthetic browser tests do not establish live named-ATS support, real model quality, site upload acceptance or production readiness.
