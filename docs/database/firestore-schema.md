# Firestore Database Schema

Vishnu uses **Firestore** as the central datastore for managing project contexts, deployments, and asynchronous job executions via the CLI and API.

## Collections

### 1. `projects`

Root collection for all linked client projects.

**Document ID:** Unique Project ID (e.g., `proj_abc123` or Firebase Project ID).

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | \`string\` | Human-readable project name |
| `type` | \`string\` | 'nextjs', 'flutter', 'python', 'cpp', 'custom' |
| `repoUrl` | \`string\` | GitHub repository URL |
| `createdAt` | \`timestamp\` | Creation date |
| `ownerUid` | \`string\` | Firebase Auth UID of the project owner |

---

### 2. `projects/{projectId}/jobs`

Subcollection for tracking build, scaffold, and code generation jobs triggered by the CLI.

**Document ID:** Auto-generated ID.

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | \`string\` | 'scaffold', 'build', 'deploy', 'generate' |
| `status` | \`string\` | 'pending', 'running', 'completed', 'failed', 'cancelled' |
| `createdBy` | \`string\` | UID of the user who initiated the job (must be staff) |
| `createdAt` | \`timestamp\` | Job queue time |
| `startedAt` | \`timestamp\` | (Optional) When processing began |
| `completedAt` | \`timestamp\` | (Optional) When processing finished |
| `logs` | \`array<string>\` | Execution logs or output summary |
| `artifacts` | \`map\` | Output paths or metadata produced by the job |

---

### 3. `users` (Optional User Profile Metadata)

While authentication claims are stored in Firebase Auth custom claims, additional user metadata can reside here.

**Document ID:** Firebase Auth UID.

| Field | Type | Description |
| :--- | :--- | :--- |
| `email` | \`string\` | User email address |
| `displayName` | \`string\` | User's full name |
| `lastActiveAt`| \`timestamp\` | Last CLI login or API usage |

## Security Model
See \`firestore.rules\` for implementation.

*   **Read Access:** Authenticated users can read project configurations and job statuses.
*   **Write Access (Projects):** Only 'owners' can create/modify/delete project records.
*   **Write Access (Jobs):** Staff members (\`projectManager\`, \`senior\`, \`dev\`) can initiate (create) jobs. Modifying/deleting jobs manually is restricted to owners, while updates during the job lifecycle are performed by the \`vishnu-api\` backend using the Admin SDK (bypassing security rules).
