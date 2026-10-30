# Architecture and data flow

This document describes the **implemented v0.2.1 internal alpha**. For proposed work, see the [implementation status](IMPLEMENTATION_STATUS.md).

## Components and trust boundaries

```mermaid
flowchart LR
    User([User]) --> Panel
    subgraph Extension["Browser extension · Manifest V3"]
        Panel["Side panel\nreview and explicit commands"]
        Coordinator["Background coordinator\nvalidation · queue · journal"]
        Driver["Isolated page driver\ninspect · write · attach"]
        Vault["Local encrypted state\nIndexedDB + session keys"]
        Documents["Local document processing\nPDF / DOCX"]
        Provider["Optional provider transport\nconsent + exact origin"]
        Panel <--> Coordinator
        Coordinator <--> Vault
        Coordinator <--> Driver
        Panel <--> Documents
        Panel --> Provider
    end
    Driver <--> Page["Application page\nsupported native controls"]
    Provider -. "approved content over HTTPS" .-> AI["Chosen AI provider"]
    User -->|"manual navigation and submission"| Page
```

The coordinator accepts commands only from the trusted extension UI. It serializes state changes, records intent and binds page actions to the inspected tab, document, snapshot and field. The driver works in the top frame and receives the individual action or selected document, not the full profile or provider key. Employer-page content and model output cannot authorize actions. See [security](SECURITY.md) for details and limits.

Document parsing and generation run locally. Saved state is encrypted with a random data key wrapped by a passphrase-derived key; session-only mode is the default. Provider calls are optional and require an explicit destination, consent and host permission. Free-text evidence may contain personal information, so users should review what they send.

## A supervised field write

```mermaid
sequenceDiagram
    actor User
    participant UI as Side panel
    participant C as Coordinator
    participant D as Page driver
    participant P as Application page
    User->>UI: Inspect current page
    UI->>C: Request inspection
    C->>D: Bind to active tab and inspect
    D->>P: Read supported visible controls
    P-->>D: Labels, values and options
    D-->>C: Snapshot
    C-->>UI: Show fields and decisions
    User->>UI: Start supervised filling
    UI->>C: Authorize action
    C->>C: Validate scope and record intent
    C->>D: One bound field action
    D->>P: Write only if preconditions still hold
    P-->>D: Resulting value and validity
    D-->>C: Verified or uncertain result
    C-->>UI: Update journal or pause
    User->>P: Review, navigate and submit manually
```

A changed field, stale snapshot, navigation, user interruption or uncertain result stops or invalidates further work. Existing user values are preserved; uncertain actions are not automatically retried. Resume attachment requires a separate explicit action and confirms only the local input state, not server acceptance. Explicit same-tab/same-origin continuation carries the journal, step URLs and upload attempts into the next page. Uncertain semantic fingerprints block a repeated dispatch even after document replacement. Job-source review remains separate from executable application authority.

## Code map

| Area | Responsibility |
| --- | --- |
| [`src/ui`](../src/ui) | Panel, review controls and user-facing state |
| [`src/orchestration`](../src/orchestration) | Command coordination, action journal and profile workflows |
| [`src/forms`](../src/forms) | Page inspection and bounded native-control actions |
| [`src/core`](../src/core) | Schemas, policies, candidate data, reuse and assessment |
| [`src/storage`](../src/storage) | Encrypted persistence, vault and backup lifecycle |
| [`src/documents`](../src/documents) | Local intake, reviewed edits, generation and attachment checks |
| [`src/providers`](../src/providers) | Optional AI request and response validation |
| [`tests`](../tests) | Unit tests and synthetic browser fixtures |

## Boundaries and next steps

The current build does not automatically navigate or submit. The bundled Lever interpreter only recognizes the observed hosted-form subset and can be disabled. Live ATS mutation validation, server-side upload acceptance, broader controls and guarded submission remain future work; see the [support matrix](SUPPORT_MATRIX.md) and [milestones](IMPLEMENTATION_STATUS.md). Synthetic browser tests open the panel in an extension tab and do not certify physical side-panel behavior. See the [verification report](VERIFICATION.md) for observed results and remaining release gates.
