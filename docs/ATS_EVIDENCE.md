# Lever hosted application adapter evidence

Observed on 30 October 2026 in installed Microsoft Edge 156.0.4314.50. The first indexed Hive posting returned 404. Navigation through the current public board found [Deploy — Senior Software Engineer, Backend](https://jobs.lever.co/hive/2473461b-9055-4229-92c0-8f807a37f041) and its public application page. No login, applicant values, files or submissions were sent.

The browser inspection confirmed a single application form, contact inputs, professional links, free-text questions, a checkbox group and one final submit button. Read-only DOM inspection established `form#application-form`, `input[data-qa="name-input"][name="name"]`, nested `.application-field` / `.application-label` structures, and group option names/values. The fixture replaces employer details, job ID, card IDs and candidate data with synthetic values. It includes only the structural subset exercised by the adapter; it is not a copy of the posting.

| Boundary | Evidence and disposition |
| --- | --- |
| Detection | `lever-hosted-v1`: exact HTTPS `jobs.lever.co` host, tenant + UUID path, observed form/name field and `#btn-submit` signals. No custom-domain or EU-host claim. |
| Executable behavior | Bundled code interprets group labels on the detected form. Generic exact native fields, reviewed checkbox choices and file-input rules still apply. Local Settings button disables the adapter. |
| Supported fixture | `tests/fixtures/lever.html`; unit shape/host checks and browser test with intercepted HTTPS traffic. All fixture requests are fulfilled locally before contacting Lever. |
| Upload | Synthetic empty, visible, labeled native input only. Real hosted upload widget, processing, size limit and server acceptance remain unvalidated. Use the site's picker for the observed live widget. |
| Navigation | No nonterminal transition was observed on the application. No click/navigation command is implemented. All unknown and final actions remain manual. |
| Live validation | Public structure observed only. Extension filling, uploads, errors, controlled-widget behavior and tenant variants have **not** been validated on the live site. |
| Unsupported surfaces | Custom location autocomplete, hidden upload widgets, frames, dynamic repeated-row creation and other tenants/variants require manual handling. |

The read-only observation establishes a basis for sanitized fixtures, not general Lever compatibility. Generic radio/open-shadow-root tests are independent synthetic fixtures, not evidence that those controls were validated on Lever.
