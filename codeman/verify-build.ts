
import { AuthService } from './core/auth';
import { GlobalState } from './core/state';

console.log("Verifying imports...");
console.log("AuthService:", !!AuthService);
console.log("GlobalState:", !!GlobalState);

const state = GlobalState.getInstance();
console.log("State Initialized:", !!state);

console.log("Build verification successful.");
process.exit(0);
