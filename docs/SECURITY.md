# Security model and permissions

0.2.0 internal alpha. Trusted extension contexts are not independent security sandboxes: a compromised dependency, extension or unlocked device can expose usable data.

## Authority boundaries

Only the exact browser-supplied extension panel URL/origin can issue strict commands. Employer pages, content scripts, imported documents and model responses cannot authorize actions. The driver runs in the isolated top frame, receives one bound field action or one explicitly selected artifact, and never receives the candidate profile or provider key. There is no click/navigation/submit command.

A queued coordinator validates revisions and writes intent before dispatch. Actions bind tab, URL, document UUID, snapshot ID, field fingerprint, generation, expected value, expiry and one-use action ID. User edits and existing files are preserved. A paused or uncertain action cannot authorize retries. File attachment verifies bytes/hash, accepted format and local native input state; it does not establish remote processing or submission.

## Permissions

| Permission | Purpose |
| --- | --- |
| activeTab | Temporary user-invoked career-page access |
| scripting | Inject bundled isolated driver in the bound top frame |
| storage | Trusted session keys and local controls |
| sidePanel | Supervised UI |
| alarms | Saved-vault idle locking, backed by deadline checks on reads/writes |
| Optional `https://*/*` | Allows configuring an arbitrary HTTPS AI provider; the settings gesture requests only the exact chosen origin |

No unconditional hosts, debugger, cookies, history, external messaging, web-accessible document URLs, remote executable code, analytics or browser sync. The broad optional declaration is needed for custom provider selection; it is not an automatic blanket host grant. CSP restricts executable scripts/workers to self and permits HTTPS connections for configured providers.

## Encryption and lifecycle

- AES-256-GCM with fresh 96-bit nonces. Envelope identity/revision is authenticated as additional data; payload schema migration is separate.
- Session-only data keys are random and live only in TRUSTED_CONTEXTS session storage. Lost session keys cause orphaned session ciphertext to be cleared.
- Saved mode generates a separate random data key, wrapped using a passphrase-derived AES-GCM key from PBKDF2-HMAC-SHA256, 600,000 iterations and random salt. The wrapping operation authenticates vault identity and idle timeout. Passphrase strength remains essential; no recovery service exists.
- Lock/end/restart removes usable data/provider keys. Idle expiry is checked even if an alarm is delayed. UI activity renews the idle deadline; background fill ticks do not keep a vault open indefinitely.
- Change-passphrase rewraps the same data key. Historical exported backups retain their original wrapping/passphrase.
- Backups contain encrypted state and wrapped-key metadata, never API keys. Restore validates size/schema, authentication and a preview-bound file hash before transactional replacement. Unreadable/corrupt/newer data is preserved; recovery UI offers backup export, restore or explicit deletion.
- Schema 1 migrates to schema 2 with conservative defaults. This alpha does not promise downgrade compatibility. Back up before updates. No forensic secure-erasure guarantee is made.
- Answer expiry and receipt retention are enforced during unlocked access and commits. Locked data cannot be rewritten without its key.

## Providers and document processing

Gemini and OpenAI have fixed URLs. A custom chat-completions endpoint must be HTTPS with no embedded credentials, nondefault port, query or fragment; literal/private/local-style hostnames are rejected. This is a syntactic destination rule, not DNS/IP attestation. The user is responsible for choosing a trusted provider. Keys are bound to the configured kind/endpoint/model; changing it invalidates pending drafts. Redirects, cookies, automatic retries and provider fallback are disabled. Responses are bounded to 100 KB and drafts to five requests with 2,000 output tokens each.

Model results are untrusted structured data. Exact evidence IDs/quotes are validated and drafts require review. Citation validation cannot prove that every generated claim follows from the citation. Live semantic-grounding evaluation is still required.

Resume intake checks signatures, size/pages, ZIP expansion, encryption and embedded binaries. DOCX extraction runs in a bounded worker; extracted text is rendered as text. These workers are not hard process/memory sandboxes. Generated documents use controlled templates, retain original lineage, reparse against approved text, reject placeholders and unsupported added numbers, and require visual review. PDF glyph/long-word rejection avoids silent clipping; DOCX visual layout and PDF accessibility tagging remain limitations.

## Remaining assurance work

Independent security review, full malicious-document/prompt corpus, more mid-commit fault injection, named ATS validation, live provider probes and store review remain pending. Dependency audit and bundle scans are focused checks, not a certification. Report issues using synthetic data; never include keys or real candidate documents in issues or test traces.

References used for design: [Chrome storage access](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [OWASP password derivation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). These contracts do not replace implementation tests.
