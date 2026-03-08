# RFC-008: Central Database Strategy

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status:** Proposed
**Area:** Infrastructure / Persistence

## 1. Overview
OpenGem distinguishes between the **Platform Database** (Central) and **Project Databases** (Isolated).

## 2. The Central Platform Database
The core platform uses a dedicated **Firebase Firestore** project to store global metadata that must persist across project switches and device moves.

### 2.1 Use Cases
- **User Identity & RBAC:** Firebase Custom Claims (Owner, Admin, Staff).
- **Global Audit Logs:** Centralized record of security violations and critical grants.
- **Skill Marketplace/Registry:** Available skills and their verified manifest signatures.

### 2.2 Schema (Platform Level)
- `/users/{uid}`: Global user profile and system-wide settings.
- `/audit/{eventId}`: Immutable log entries.
- `/skills/{skillId}`: Manifest definitions and checksums.

## 3. Isolation Guarantees
**Crucial:** The Platform Firestore is NOT accessible to user-created agents or projects by default.
- Agents requesting `net.firestore` capability are given credentials for a **Project-Specific** Firebase instance, never the Platform Core instance.
- Only the `Trusted Core` (Codeman logic) has access to the Central Platform Database.

## 4. RBAC Schema
Legacy Claims mapping:
- `owner`: God Mode (Main Owner).
- `admin`: Operational control (Skill management).
- `staff`: Execution rights for pre-defined workflows.
