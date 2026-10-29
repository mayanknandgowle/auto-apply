# ApplyPilot privacy notice — internal alpha draft

29 October 2026 · version 0.2.0. Publisher identity and store/legal review are pending.

ApplyPilot processes confirmed contact/career details, selected resume files, approved text changes, job descriptions, remembered answers, receipts and visible controls on an application page you authorize. It does not intentionally collect cookies, browsing history, passwords, OTPs, authentication tokens or other candidates' profiles.

There is no ApplyPilot backend, account, analytics or browser sync. Sensitive records are encrypted in local IndexedDB. Usable data keys and optional API keys remain in trusted extension session storage while unlocked. The extension and a privileged user of an unlocked device can access this data.

Session-only is the default. Panel closure and service-worker restarts preserve that session; browser restart, extension reload/disable/update and End session remove usable session keys. Orphaned session ciphertext is cleared on initialization. Saved-profile mode preserves encrypted data across restarts behind a user-chosen passphrase. Locking clears usable keys and panel drafts. There is no forgotten-passphrase recovery. Deletion is not guaranteed forensic erasure.

Encrypted backups are downloaded only on request and require their passphrase for restore. Backup preview displays identifying information after decryption. Restoring replaces local profile/resume/history data and clears active application work and provider keys. Plaintext receipt export explicitly includes personal application data. Exported files are outside the extension's deletion and retention controls.

Remembered answers expire after seven days for time-sensitive compensation/availability wording and thirty days otherwise; reuse also requires matching job scope, exact options and unchanged profile revision. Receipt retention is configurable to thirty days, ninety days or until deletion. Expired records are removed on subsequent unlocked access; encrypted backups are not rewritten. Imported-source deletion clears related rollback data, while independently confirmed facts may remain marked as source-deleted.

Optional Gemini, OpenAI and custom compatible providers receive requests directly from the extension. A connection test sends synthetic text. A reviewed draft request sends the displayed question, job description and confirmed career evidence. It excludes contact-profile fields and original resume files, but free text can still contain personal details. The configured provider receives the API key and approved content under its own data, quota and billing terms. There is no automatic fallback to another provider. Keys are not included in backups.

Filling fields or explicitly attaching a selected resume can immediately transmit data to an employer through normal site behavior, including autosave/upload. ApplyPilot cannot retract remote copies. It verifies local attachment only; employer processing and final submission remain the user's responsibility. No automatic submission is available.

Use Settings to lock/end the session, export/restore backups, revoke provider origins, or delete all local data by typing DELETE. Individual sources, answers, derivatives and receipts can also be removed. Browser removal follows the browser's extension-storage behavior.

No sale of data, advertising, diagnostic upload or remote profiling service is implemented. Future capabilities require updated disclosures and appropriate user choices. This alpha has not been submitted to an extension store.
