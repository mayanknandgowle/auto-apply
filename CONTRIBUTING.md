# Contributing

Thank you for helping make application workflows more transparent and reliable. ApplyPilot is an internal alpha; review [the current scope and remaining milestones](docs/IMPLEMENTATION_STATUS.md) before starting substantial work.

## Get started

Use Node 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, then `pnpm check`. For browser tests, install Chromium with `pnpm exec playwright install chromium` and run `pnpm test:e2e`.

Open an issue to discuss substantial changes. A useful report includes the behavior, expected behavior, reproduction steps, browser version and a **synthetic** fixture. Do not post resumes, credentials, applicant information or traces containing personal data.

## Pull requests

Keep changes focused, explain the user-visible behavior and limits, and include checks relevant to the change. Preserve explicit consent, user review, data minimization and the manual submission boundary. Add regression coverage for new behaviors and document supported surfaces honestly. Never test submission on a real employer application without appropriate authorization.

See [security](docs/SECURITY.md), [privacy](docs/PRIVACY.md), and [verification](docs/VERIFICATION.md) for existing assumptions and test boundaries.

## License

No open-source license has yet been selected. Contact the repository owner about reuse or distribution permissions.
