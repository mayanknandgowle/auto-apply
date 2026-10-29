# Support matrix

29 October 2026 · 0.2.0 internal alpha. Fixture-tested means local synthetic pages, not live ATS certification. Consult VERIFICATION.md for the final run results.

| Capability | Implemented boundary | Fallback / remaining gate |
| --- | --- | --- |
| Chrome/Edge MV3 build | Trusted panel, serialized worker, isolated top-frame driver | Installed-browser toolbar/side-panel and minimum-version smoke tests |
| Contact autofill | Exact labels/options, empty visible native controls, React setters, conditional undo | Ambiguous/duplicate/existing controls remain manual |
| Career records | Employment/internships, education, projects, skills, compensation and authorization | Most legal/financial/experience website questions still require explicit answers |
| Experience/pay calculations | Overlap union and precision abstention; context-matched pay conversion helper | No currency conversion or inferred legal status |
| Imports | PDF/DOCX/pasted contacts, individual review, provenance, conditional rollback | Direct Naukri/Indeed and full career extraction unvalidated |
| Saved answers | Exact question/options plus confirmed job scope and expiry | Profile/context changes disable reuse; no broad narrative reuse |
| Session/saved storage | AES-GCM, PBKDF2 key wrapping, idle lock, rewrap, migration, encrypted backup preview/restore | Forgotten passphrases unrecoverable; unlocked-device compromise not prevented |
| Resume assessment | Manual evidence review, exact excerpts, weighted score, coverage, duplicate normalization | Not a prediction/ATS score; no live AI assessment evaluation |
| Resume derivatives | Reviewed plain-text template, PDF/DOCX output, reparse comparison, original preservation | No arbitrary-layout preservation, OCR, tagged PDF or complex-script PDF shaping |
| Document previews | Actual PDF pages with local fonts | DOCX visual pagination requires Word/LibreOffice review |
| Native resume attachment | Explicit action; empty labeled resume input; accepted-format/hash checks; attempt journal | Server processing unverified; rejected/uncertain attempts require manual resolution |
| Navigation/submission | User-controlled only | No automatic click, next-step or submit command |
| Checkboxes/radios/custom controls | Decision/manual handoff | No automatic consent, repeated-row creation or custom-widget handling |
| Shadow roots/embedded frames | Unsupported | Manual handoff; top frame only |
| Greenhouse/Lever/Ashby/Workday | No validated named adapter | Generic supported native controls only |
| Gemini/OpenAI/custom provider | Implemented protocol adapters with bounded structured responses | Mock transport tests do not establish live connectivity, quality or arbitrary-provider compatibility |
| Receipts | Current-page journal, selected artifact and separate attachment attempts; prepared/user-reported labels | Server acceptance/submission independently unverified; cross-step application history incomplete |
| Accessibility | Explicit labels, keyboard-native controls and automated axe coverage | Full keyboard/zoom/screen-reader audit and document accessibility certification pending |

Release permissions have no unconditional hosts. An optional HTTPS host pattern enables a user-chosen API host, but the UI requests one exact origin. Career-page injection still uses the invoked activeTab. Test builds add localhost separately and must not be distributed.
