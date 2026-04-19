import { z } from 'zod';

export const FirestoreCollectionSchema = z.object({
  name: z.string().refine(val => /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(val), {
    message: 'Collection name must be in kebab-case.',
  }),
  classification: z.enum(['public', 'private', 'shared', 'private-plaintext']),
  description: z.string(),
  schema: z.string(), // This will store the Zod schema as a string or description of the schema
});

export const FirestoreRegistrySchema = z.object({
  collections: z.array(FirestoreCollectionSchema),
});

// Candyland Collections Registry
export const CANADY_STORE_COLLECTIONS: FirestoreCollection[] = [
  {
    name: 'users',
    classification: 'private-plaintext',
    description: 'User authentication and profile information for customers and administrators',
    schema: 'UserProfileSchema & CustomerProfileSchema',
  },
  {
    name: 'udhhmbtc',
    classification: 'private',
    description: 'Encrypted sharding volume containing products, sales, expenses, expense categories, and inventory items',
    schema: 'EncryptedVolumeSchema (auth, meta-data, chunk-*)',
  },
  {
    name: 'app-config',
    classification: 'public',
    description: 'Global application configuration and initialization state',
    schema: 'AppConfigSchema',
  },
  {
    name: 'assistant-settings',
    classification: 'public',
    description: 'Settings for the Candyland AI assistant',
    schema: 'AssistantSettingsSchema',
  },
  {
    name: 'firestore-registry',
    classification: 'private-plaintext',
    description: 'Dynamic registry of active Firestore collections (self-referential)',
    schema: 'FirestoreRegistrySchema',
  },
  {
    name: 'sessions',
    classification: 'private',
    description: 'Active authenticated sessions for admin/owner access, storing encrypted master password keys',
    schema: 'SessionSchema',
  },
  {
    name: 'staff',
    classification: 'private-plaintext',
    description: 'Staff member profiles and basic details',
    schema: 'EmployeeSchema',
  },
  {
    name: 'inventory',
    classification: 'shared',
    description: 'Encrypted payloads mapping inventory items to specific staff members',
    schema: 'InventoryAssignmentSchema',
  },
  {
    name: 'staff-data',
    classification: 'private-plaintext',
    description: 'Staff security layer containing encrypted personal data, passkeys, and authentication keys',
    schema: 'StaffDataSchema',
  },
  {
    name: 'totp-secrets',
    classification: 'private-plaintext',
    description: 'Server-side storage of TOTP secrets for user 2FA (No client access)',
    schema: 'TotpSecretSchema',
  },
  {
    name: 'passkeys',
    classification: 'private-plaintext',
    description: 'Registered WebAuthn passkeys for passwordless authentication',
    schema: 'PasskeySchema',
  },
  {
    name: 'webauthn-challenges',
    classification: 'private-plaintext',
    description: 'Temporary challenges for WebAuthn registration and authentication',
    schema: 'WebAuthnChallengeSchema',
  },
  {
    name: 'public',
    classification: 'public',
    description: 'Publicly accessible data, including public keys for staff members',
    schema: 'PublicKeySchema',
  },
  {
    name: 'messages',
    classification: 'shared',
    description: 'Encrypted communication channels between staff and admins',
    schema: 'EncryptedMessageSchema',
  },
  {
    name: 'sentinel',
    classification: 'private',
    description: 'Sentinel RTDB state metadata mirror (or direct configs)',
    schema: 'SentinelConfigSchema',
  },
];

export type FirestoreCollection = z.infer<typeof FirestoreCollectionSchema>;
export type FirestoreRegistry = z.infer<typeof FirestoreRegistrySchema>;
