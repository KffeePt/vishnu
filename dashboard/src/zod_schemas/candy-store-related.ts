import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

export const TimestampSchema = z.instanceof(Timestamp);



export const UdhhmbtcSchema = z.object({
  id: z.string(),
  candyName: z.string(),
  grams: z.number().positive(), // weight per unit or total weight?
  totalSold: z.number().int().positive(), // quantity sold
  recordedBy: z.string(), // userId of admin who recorded
  createdAt: TimestampSchema,
});


export type Udhhmbtc = z.infer<typeof UdhhmbtcSchema>;

export const EmployeeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(['admin', 'manager', 'staff']),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(32, "Username must be 32 characters or fewer").regex(/^[A-Za-z0-9._-]+$/, "Username can only contain letters, numbers, periods, underscores, and hyphens").optional(),
  phoneNumber: z.string().optional(),
  isActive: z.boolean().default(true),
  userId: z.string().optional(),
  password: z.string().optional(),
  profitPercent: z.number().min(0).max(100).optional(),
});

export const InventoryAssignmentSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  quantity: z.number().min(0),
  sold: z.number().min(0).optional(),
});

export const InventoryItemSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  unitValue: z.number().min(0, "Value cannot be negative"),
  originalCost: z.number().min(0).optional(),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  unit: z.enum(['pcs', 'mg', 'grams', 'kg', 'oz']),
  assignments: z.array(InventoryAssignmentSchema).optional(),
  notes: z.string().optional(),
  flexiblePrice: z.boolean().optional(),
  flexibilityPercent: z.number().min(0).max(100).optional(),
  maxPriceCap: z.number().min(0).optional(),
  craftable: z.boolean().optional(),
  costOverride: z.number().min(0).optional(),
  promoPricing: z.object({
    tiers: z.array(z.object({
      qty: z.number().min(1),
      price: z.number().min(0)
    }))
  }).optional(),
});

export const CraftingRecipeSchema = z.object({
  outputItemId: z.string(),
  outputItemName: z.string().optional(),
  outputItemUnit: z.string().optional(),
  outputQuantity: z.number().positive(),
  ingredients: z.array(z.object({
    itemId: z.string(),
    ingredientName: z.string().optional(),
    ingredientUnit: z.string().optional(),
    quantity: z.number().positive(),
  })).min(1),
  reversible: z.boolean().optional(),
  salvageQuantity: z.record(z.string(), z.number().min(0)).optional(),
  visibility: z.enum(['public', 'private']).default('public').optional(),
  allowedStaffIds: z.array(z.string()).optional(),
});

export const RefundRequestSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string(),
  employeeName: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  quantity: z.number().positive(),
  unit: z.enum(['pcs', 'mg', 'grams', 'kg', 'oz']),
  reason: z.enum(['inventory_loss', 'venta_cancelada']),
  note: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.any().optional(), // Firebase Timestamp or string
  saleId: z.string().optional(), // Only for venta_cancelada
});



export type Employee = z.infer<typeof EmployeeSchema>;
export type InventoryAssignment = z.infer<typeof InventoryAssignmentSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;
export type RefundRequest = z.infer<typeof RefundRequestSchema>;
