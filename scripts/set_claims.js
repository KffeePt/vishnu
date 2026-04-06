#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_ADMIN_SDK = path.join(ROOT_DIR, '.secrets', 'admin-sdk.json');

const ROLE_PRESETS = {
  owner: { role: 'owner', owner: true, admin: true, user: true },
  admin: { role: 'admin', admin: true, user: true },
  staff: { role: 'staff', staff: true, user: true },
  dev: { role: 'dev', dev: true, user: true },
  user: { role: 'user', user: true },
  master: { role: 'owner', owner: 'master', admin: true, user: true },
  test: { test: true },
  revoke: {}
};

function printHeader() {
  console.log(chalk.cyan.bold('\n========================================'));
  console.log(chalk.cyan.bold('   Firebase Claim Manager (Secure)     '));
  console.log(chalk.cyan.bold('========================================'));
}

function printHelp() {
  console.log('\nUsage:');
  console.log('  node scripts/set_claims.js [uid-or-email] [role]');
  console.log('\nExamples:');
  console.log('  node scripts/set_claims.js 7xYz123 owner');
  console.log('  node scripts/set_claims.js santi@example.com admin');
  console.log('  node scripts/set_claims.js --custom');
  console.log('\nNotes:');
  console.log('  - Uses .secrets/admin-sdk.json by default.');
  console.log('  - Preset roles merge safely with existing non-role claims.');
  console.log('  - Use "test" to add { test: true } without changing the role.');
  console.log('  - Use "revoke" to clear all custom claims for a user.');
}

function parseArgs(argv) {
  const result = {
    uidOrEmail: '',
    role: '',
    custom: false,
    replace: false,
    help: false
  };

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--custom') {
      result.custom = true;
    } else if (arg === '--replace') {
      result.replace = true;
    } else if (arg === '--uid' || arg === '-u') {
      result.uidOrEmail = args[i + 1] || '';
      i++;
    } else if (arg === '--role' || arg === '-r') {
      result.role = args[i + 1] || '';
      i++;
    } else if (!result.uidOrEmail) {
      result.uidOrEmail = arg;
    } else if (!result.role) {
      result.role = arg;
    }
  }

  return result;
}

function resolveServiceAccountPath() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidates = [DEFAULT_ADMIN_SDK, envPath].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadServiceAccount() {
  const serviceAccountPath = resolveServiceAccountPath();
  if (!serviceAccountPath) {
    throw new Error(`Missing service account key. Expected ${DEFAULT_ADMIN_SDK}`);
  }

  const raw = fs.readFileSync(serviceAccountPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(`Invalid service account JSON: ${serviceAccountPath}`);
  }

  return {
    serviceAccountPath,
    serviceAccount: parsed
  };
}

function ensureAdminInit(serviceAccount) {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

async function resolveUser(uidOrEmail) {
  if (!uidOrEmail) {
    throw new Error('Missing user UID or email.');
  }

  if (uidOrEmail.includes('@')) {
    return await admin.auth().getUserByEmail(uidOrEmail);
  }

  return await admin.auth().getUser(uidOrEmail);
}

function stripRoleClaims(claims) {
  const next = { ...claims };
  delete next.role;
  delete next.owner;
  delete next.admin;
  delete next.staff;
  delete next.dev;
  delete next.user;
  delete next.test;
  return next;
}

async function promptCustomClaims(existingClaims) {
  const { rawJson } = await inquirer.prompt([
    {
      type: 'input',
      name: 'rawJson',
      message: 'Paste the full custom claims JSON object:',
      default: JSON.stringify(existingClaims || {}, null, 2)
    }
  ]);

  const parsed = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Custom claims must be a JSON object.');
  }

  return parsed;
}

async function main() {
  printHeader();

  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const { serviceAccountPath, serviceAccount } = loadServiceAccount();
  ensureAdminInit(serviceAccount);

  const currentProject = serviceAccount.project_id || 'unknown-project';
  console.log(chalk.gray(`Using secure credentials: ${serviceAccountPath}`));
  console.log(chalk.gray(`Firebase project: ${currentProject}`));

  const answers = args.uidOrEmail && args.role
    ? { uidOrEmail: args.uidOrEmail, roleChoice: args.custom ? 'custom' : args.role, replaceExisting: args.replace }
    : await inquirer.prompt([
        {
          type: 'input',
          name: 'uidOrEmail',
          message: 'Enter the user UID or email:'
        },
        {
          type: 'list',
          name: 'roleChoice',
          message: 'Select claim preset:',
          choices: [
            { name: 'Owner (owner + admin + user)', value: 'owner' },
            { name: 'Admin (admin + user)', value: 'admin' },
            { name: 'Staff (staff + user)', value: 'staff' },
            { name: 'Developer (dev + user)', value: 'dev' },
            { name: 'User only', value: 'user' },
            { name: 'Master owner bootstrap (owner: "master")', value: 'master' },
            { name: 'Test flag only (merge test: true)', value: 'test' },
            { name: 'Revoke all claims', value: 'revoke' },
            { name: 'Custom JSON claims', value: 'custom' }
          ]
        },
        {
          type: 'confirm',
          name: 'replaceExisting',
          message: 'Replace existing role claims first? (recommended for role presets)',
          default: false
        }
      ]);

  const user = await resolveUser(answers.uidOrEmail);
  const currentClaims = user.customClaims || {};
  let nextClaims;

  if (answers.roleChoice === 'custom') {
    nextClaims = await promptCustomClaims(currentClaims);
  } else if (answers.roleChoice === 'revoke') {
    nextClaims = {};
  } else if (answers.roleChoice === 'test') {
    nextClaims = { ...currentClaims, test: true };
  } else {
    const preset = ROLE_PRESETS[answers.roleChoice];
    if (!preset) {
      throw new Error(`Unknown role preset: ${answers.roleChoice}`);
    }
    nextClaims = answers.replaceExisting
      ? preset
      : { ...stripRoleClaims(currentClaims), ...preset };
  }

  console.log('\nCurrent claims:');
  console.log(JSON.stringify(currentClaims, null, 2));
  console.log('\nNew claims:');
  console.log(JSON.stringify(nextClaims, null, 2));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: answers.roleChoice === 'revoke'
        ? `Revoke all claims for ${user.email || user.uid}?`
        : `Apply claims to ${user.email || user.uid}?`,
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\nCancelled. No claims were changed.'));
    return;
  }

  try {
    await admin.auth().setCustomUserClaims(user.uid, nextClaims);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('Error when attempting to fetch resource')) {
      throw new Error(
        'Firebase Auth could not fetch that user. Check that the service account in .secrets/admin-sdk.json has Firebase Auth access and that the Identity Toolkit API is enabled, or try using the UID instead of email.'
      );
    }
    throw error;
  }

  const refreshed = await admin.auth().getUser(user.uid);
  console.log(chalk.green('\n✅ Claims updated successfully.'));
  console.log(chalk.gray(`User: ${refreshed.email || refreshed.uid}`));
  console.log(chalk.gray(`UID: ${refreshed.uid}`));
  console.log(chalk.gray('Applied claims:'));
  console.log(JSON.stringify(refreshed.customClaims || {}, null, 2));
}

main().catch((error) => {
  console.error(chalk.red('\n❌ Failed to set claims.'));
  console.error(chalk.red(error?.message || String(error)));
  process.exit(1);
});
