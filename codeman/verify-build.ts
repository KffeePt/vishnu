/*
Legacy build verification entry disabled during RFC-011 migration.

Original implementation has been moved to:
  modules/codeman/verify-build.ts

The preserved code below is intentionally commented out so this legacy path
is no longer the functional source of truth.
*/

/*
import { AuthService } from './core/auth';
import { GlobalState } from './core/state';

console.log("Verifying imports...");
console.log("AuthService:", !!AuthService);
console.log("GlobalState:", !!GlobalState);

const state = GlobalState.getInstance();
console.log("State Initialized:", !!state);

console.log("Build verification successful.");
process.exit(0);
*/

throw new Error('Legacy codeman/verify-build.ts is disabled. Use modules/codeman/verify-build.ts.');
