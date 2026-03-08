# RFC-000: The Master Index

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the **Master Index**, the single source of truth for all Request For Comments (RFC) documents in the OpenGem platform. It establishes the **RFC Schema**, a mechanical law enforced by the linter to ensure all specifications remain structured, accessible, and queryable by the **Spec Viewer**.

## 2. The RFC Schema

All RFCs must strictly adhere to the following Markdown structure to be parsed by the Spec Viewer:

```typescript
interface RFCDocument {
  header: {
    number: number;       // "RFC-001"
    title: string;        // "OpenGem Secure Agent Platform"
    status: RFCStatus;    // "Draft", "Accepted", "Implemented", "Deprecated"
    authors: string[];
    created: string;      // YYYY-MM-DD
  };
  sections: Section[];
}

type RFCStatus = 'Draft' | 'Proposed' | 'Accepted' | 'Implemented' | 'Deprecated';
```

### 2.1 File Naming Convention
Files must be named using the kebab-case format: `rfc-{number}-{keyword-slug}.md`.
Example: `rfc-001-opengem-platform.md`

### 2.2 Header Format
The first 10 lines of every RFC must contain the metadata block:

```markdown
# RFC-{000}: {Title}

**Status:** {Status}
**Authors:** {Author List}
**Created:** {YYYY-MM-DD}
```

## 3. RFC Index
 
| RFC                                                 | Title                         | Status      | Category     |
|-----------------------------------------------------|-------------------------------|-------------|--------------|
| [RFC-001](./rfc-001-opengem-platform.md)            | OpenGem Secure Agent Platform | Implemented | Core         |
| [RFC-002](./rfc-002-capability-manifest.md)         | Capability Manifest           | Draft       | Security     |
| [RFC-003](./rfc-003-execution-runtime.md)           | Execution Runtime             | Draft       | Runtime      |
| [RFC-004](./rfc-004-agent-lifecycle.md)             | Agent Lifecycle               | Draft       | Runtime      |
| [RFC-005](./rfc-005-skill-forge.md)                 | Skill Forge                   | Draft       | SDK          |
| [RFC-006](./rfc-006-hot-reload-architecture.md)     | Hot Reload Architecture       | Implemented | Runtime      |
| [RFC-007](./rfc-007-authentication-and-identity.md) | Authentication & Identity     | Draft       | Security     |
| [RFC-008](./rfc-008-central-database.md)            | Central Database              | Draft       | Infra        |
| [RFC-009](./rfc-009-notrust-isolation.md)           | No-Trust Isolation            | Proposed    | Security     |
| [RFC-010](./rfc-010-tools-cli-architecture.md)      | Tools CLI Architecture        | Implemented | Tools        |
| [RFC-011](./rfc-011-unified-module-architecture.md) | Unified Module Architecture   | Implemented | Core         |
| [RFC-012](./rfc-012-dependency-law.md)              | Dependency Law                | Implemented | Core         |
| [RFC-013](./rfc-013-custom-linter-laws.md)          | Custom Linter Laws            | Implemented | Tools        |
| [RFC-014](./rfc-014-schema-architecture.md)         | Schema Architecture           | Draft       | Core         |
| [RFC-015](./rfc-015-framework-specification.md)     | Framework Specification       | Draft       | SDK          |
| [RFC-016](./rfc-016-declarative-menu-router.md)     | Declarative Menu Router       | Draft       | Core         |
| [RFC-017](./rfc-017-api-only-side-effects.md)       | API-Only Side Effects         | Draft       | Core         |
| [RFC-018](./rfc-018-platform-api.md)                | Platform API Bridge           | Draft       | Platform     |
| [RFC-019](./rfc-019-terminal-rendering-engine.md)   | Terminal Rendering Engine     | Draft       | Platform     |
| [RFC-020](./rfc-020-opengem-firewall.md)            | OpenGem Firewall              | Proposed    | Security     |
| [RFC-021](./rfc-021-opengem-packages.md)            | Packages Architecture         | Draft       | Architecture |
| [RFC-022](./rfc-022-opengem-gateway.md)             | OpenGem Gateway               | Draft       | Gateway      |

*Note: This index is mechanically verified by the Tools CLI.*
