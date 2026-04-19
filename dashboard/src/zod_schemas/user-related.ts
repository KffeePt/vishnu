import { z } from 'zod';

export const UserProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  photoURL: z.string().url().nullable(),
  role: z.enum(['admin', 'manager', 'customer', 'owner']),
  provider: z.string().optional(),
  createdAt: z.any().optional(),
  lastLoginAt: z.any().optional(),
  theme: z.string().optional(),
});

export const CustomerProfileSchema = z.object({
  uid: z.string(),
  name: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  shippingAddresses: z.array(z.object({
    id: z.string(),
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
    isDefault: z.boolean().default(false),
  })).optional(),
  preferences: z.object({
    favoriteFlavors: z.array(z.string()).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    notifications: z.boolean().default(true),
  }).optional(),
  loyaltyPoints: z.number().int().min(0).default(0),
  totalOrders: z.number().int().min(0).default(0),
  joinDate: z.any(),
});

export const UserRoleSchema = z.enum(["Admin", "Manager", "Customer", "Owner"]);

export const RoleHierarchySchema = z.object({
  role: z.enum(['owner', 'admin', 'manager']),
  priority: z.number().min(1).max(3), // 1 = highest (owner), 3 = lowest (manager)
  permissions: z.object({
    canAccessAdminPanel: z.boolean(),
    canManageUsers: z.boolean(),
    canDeleteData: z.boolean(),
    canViewVolume: z.boolean(),
    canManageMasterPassword: z.boolean(),
  }),
});

export const UserEffectiveRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'manager']),
  priority: z.number(),
  permissions: z.object({
    canAccessAdminPanel: z.boolean(),
    canManageUsers: z.boolean(),
    canDeleteData: z.boolean(),
    canViewVolume: z.boolean(),
    canManageMasterPassword: z.boolean(),
  }),
  allClaims: z.record(z.any()), // All Firebase claims for debugging
});

export const RoleResolutionRequestSchema = z.object({
  claims: z.record(z.any()), // Firebase ID token claims
});

export const RoleResolutionResponseSchema = z.object({
  effectiveRole: UserEffectiveRoleSchema,
  resolutionMethod: z.enum(['single_claim', 'hierarchy_resolution', 'no_valid_claims']),
});

export const MasterPasswordSchema = z.object({
  passwordHash: z.string(),
  setBy: z.string(),
  setAt: z.date().optional(),
  isValid: z.boolean().default(true),
});

export const EncryptedDataSchema = z.object({
  encryptedData: z.string(),
  salt: z.string(),
  iv: z.string(),
  authTag: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type CustomerProfile = z.infer<typeof CustomerProfileSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type MasterPassword = z.infer<typeof MasterPasswordSchema>;
export type EncryptedData = z.infer<typeof EncryptedDataSchema>;
export type RoleHierarchy = z.infer<typeof RoleHierarchySchema>;
export type UserEffectiveRole = z.infer<typeof UserEffectiveRoleSchema>;
export type RoleResolutionRequest = z.infer<typeof RoleResolutionRequestSchema>;
export type RoleResolutionResponse = z.infer<typeof RoleResolutionResponseSchema>;
