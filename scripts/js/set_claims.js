#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_ADMIN_SDK = path.join(ROOT_DIR, '.secrets', 'admin-sdk.json');
const ROOT_ADMIN_SDK = path.join(ROOT_DIR, 'admin-sdk.json');

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

const STRIPPED_ROLE_KEYS = [
  'role',
  'owner',
  'admin',
  'staff',
  'dev',
  'user',
  'test'
];

function printHeader() {
  console.log(chalk.cyan.bold('\n========================================'));
  console.log(chalk.cyan.bold('   Firebase Claim Manager (Mini TUI)    '));
  console.log(chalk.cyan.bold('========================================'));
}

function printHelp() {
  console.log('\nUsage:');
  console.log('  node scripts/js/set_claims.js [uid-or-email] [role]');
  console.log('\nExamples:');
  console.log('  node scripts/js/set_claims.js 7xYz123 owner');
  console.log('  node scripts/js/set_claims.js santi@example.com admin');
  console.log('  node scripts/js/set_claims.js --custom');
  console.log('\nNotes:');
  console.log('  - Uses .secrets/admin-sdk.json by default.');
  console.log('  - Preset roles merge safely with existing non-role claims.');
  console.log('  - Interactive mode supports add/update/remove claim actions.');
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
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--custom') {
      result.custom = true;
    } else if (arg === '--replace') {
      result.replace = true;
    } else if (arg === '--uid' || arg === '-u') {
      result.uidOrEmail = args[index + 1] || '';
      index += 1;
    } else if (arg === '--role' || arg === '-r') {
      result.role = args[index + 1] || '';
      index += 1;
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
  const candidates = [envPath, DEFAULT_ADMIN_SDK, ROOT_ADMIN_SDK].filter(Boolean);
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
  if (admin.apps.length > 0) {
    return;
  }

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
  const next = { ...(claims || {}) };
  for (const key of STRIPPED_ROLE_KEYS) {
    delete next[key];
  }
  return next;
}

function parseLooseClaimValue(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (text === '') return '';

  const lower = text.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;

  if (!Number.isNaN(Number(text)) && text === String(Number(text))) {
    return Number(text);
  }

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return JSON.parse(text);
  }

  return text;
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

function printClaims(title, claims) {
  console.log(chalk.bold(`\n${title}:`));
  console.log(JSON.stringify(claims || {}, null, 2));
}

async function confirmClaimsChange(user, currentClaims, nextClaims, message) {
  printClaims('Current claims', currentClaims);
  printClaims('New claims', nextClaims);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: message || `Apply claims to ${user.email || user.uid}?`,
      default: false
    }
  ]);

  return confirm;
}

async function applyClaims(user, nextClaims) {
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

  return await admin.auth().getUser(user.uid);
}

async function promptAddOrUpdateClaim(currentClaims) {
  const { claimKey, rawValue } = await inquirer.prompt([
    {
      type: 'input',
      name: 'claimKey',
      message: 'Claim key to add/update:',
      validate: (input) => String(input || '').trim() ? true : 'Claim key is required.'
    },
    {
      type: 'input',
      name: 'rawValue',
      message: 'Claim value (supports true/false/null/number/JSON):',
      default: ''
    }
  ]);

  const nextClaims = {
    ...(currentClaims || {}),
    [String(claimKey).trim()]: parseLooseClaimValue(rawValue)
  };

  return nextClaims;
}

async function promptRemoveClaim(currentClaims) {
  const entries = Object.keys(currentClaims || {});
  if (entries.length === 0) {
    console.log(chalk.yellow('\nNo claims are currently set for this user.'));
    return null;
  }

  const { claimKey } = await inquirer.prompt([
    {
      type: 'list',
      name: 'claimKey',
      message: 'Select claim to remove:',
      choices: entries.map((key) => ({
        name: `${key}: ${JSON.stringify(currentClaims[key])}`,
        value: key
      }))
    }
  ]);

  const nextClaims = { ...(currentClaims || {}) };
  delete nextClaims[claimKey];
  return nextClaims;
}

async function runInteractiveClaimManager(user) {
  let refreshedUser = user;

  while (true) {
    const currentClaims = refreshedUser.customClaims || {};
    console.log(chalk.gray('\n----------------------------------------'));
    console.log(chalk.white(`Target: ${refreshedUser.email || refreshedUser.uid}`));
    console.log(chalk.white(`UID: ${refreshedUser.uid}`));
    console.log(chalk.gray('Current claims:'));
    console.log(JSON.stringify(currentClaims, null, 2));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select claim action:',
        choices: [
          { name: 'Apply preset role', value: 'preset' },
          { name: 'Add / update one claim', value: 'add' },
          { name: 'Remove one claim', value: 'remove' },
          { name: 'Custom JSON replace', value: 'custom' },
          { name: 'Revoke all claims', value: 'revoke' },
          { name: 'Refresh current claims', value: 'refresh' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    if (action === 'exit') {
      break;
    }

    if (action === 'refresh') {
      refreshedUser = await admin.auth().getUser(refreshedUser.uid);
      continue;
    }

    let nextClaims = null;
    let confirmMessage = `Apply claims to ${refreshedUser.email || refreshedUser.uid}?`;

    if (action === 'preset') {
      const { roleChoice, replaceExisting } = await inquirer.prompt([
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
            { name: 'Test flag only (merge test: true)', value: 'test' }
          ]
        },
        {
          type: 'confirm',
          name: 'replaceExisting',
          message: 'Replace existing role claims first?',
          default: false
        }
      ]);

      if (roleChoice === 'test') {
        nextClaims = { ...currentClaims, test: true };
      } else {
        const preset = ROLE_PRESETS[roleChoice];
        nextClaims = replaceExisting
          ? { ...preset }
          : { ...stripRoleClaims(currentClaims), ...preset };
      }
    } else if (action === 'add') {
      nextClaims = await promptAddOrUpdateClaim(currentClaims);
    } else if (action === 'remove') {
      nextClaims = await promptRemoveClaim(currentClaims);
      if (!nextClaims) {
        continue;
      }
    } else if (action === 'custom') {
      nextClaims = await promptCustomClaims(currentClaims);
    } else if (action === 'revoke') {
      nextClaims = {};
      confirmMessage = `Revoke all claims for ${refreshedUser.email || refreshedUser.uid}?`;
    }

    if (!nextClaims) {
      continue;
    }

    const confirmed = await confirmClaimsChange(refreshedUser, currentClaims, nextClaims, confirmMessage);
    if (!confirmed) {
      console.log(chalk.yellow('\nCancelled. No claims were changed.'));
      continue;
    }

    refreshedUser = await applyClaims(refreshedUser, nextClaims);
    console.log(chalk.green('\n✅ Claims updated successfully.'));
  }

  return refreshedUser;
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

  let user;
  if (args.uidOrEmail) {
    user = await resolveUser(args.uidOrEmail);
  } else {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'uidOrEmail',
        message: 'Enter the user UID or email:',
        validate: (input) => String(input || '').trim() ? true : 'User UID or email is required.'
      }
    ]);
    user = await resolveUser(answers.uidOrEmail);
  }

  if (!args.role && !args.custom) {
    const refreshed = await runInteractiveClaimManager(user);
    console.log(chalk.green('\n✅ Final claims snapshot:'));
    console.log(JSON.stringify(refreshed.customClaims || {}, null, 2));
    return;
  }

  const currentClaims = user.customClaims || {};
  let nextClaims;

  if (args.custom) {
    nextClaims = await promptCustomClaims(currentClaims);
  } else if (args.role === 'revoke') {
    nextClaims = {};
  } else if (args.role === 'test') {
    nextClaims = { ...currentClaims, test: true };
  } else {
    const preset = ROLE_PRESETS[args.role];
    if (!preset) {
      throw new Error(`Unknown role preset: ${args.role}`);
    }
    nextClaims = args.replace
      ? { ...preset }
      : { ...stripRoleClaims(currentClaims), ...preset };
  }

  const confirmed = await confirmClaimsChange(
    user,
    currentClaims,
    nextClaims,
    args.role === 'revoke'
      ? `Revoke all claims for ${user.email || user.uid}?`
      : `Apply claims to ${user.email || user.uid}?`
  );

  if (!confirmed) {
    console.log(chalk.yellow('\nCancelled. No claims were changed.'));
    return;
  }

  const refreshed = await applyClaims(user, nextClaims);
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
