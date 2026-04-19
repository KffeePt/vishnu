// Types for Candyland components

export interface CandySale {
  id: string;
  candyName: string;
  grams: number;
  totalSold: number;
  originalCost?: number; // Per-unit cost for payroll calculation
  recordedBy: string;
  createdAt: string | Date;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string | Date;
  recordedBy: string;
  createdAt: string | Date;
}

export interface CandyProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  flavor: string | null;
  description: string;
  imageUrl: string;
  stockQuantity: number;
  weightGrams: number | null;
  encryptedData?: any; // Present when data is encrypted
}

export interface ProductFormData {
  name: string;
  price: string;
  flavor: string;
  description: string;
  imageUrl: string;
  stockQuantity: string;
  weightGrams: string;
  productType: 'by-weight' | 'by-package';
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: string | Date;
}

export interface CategoryOption {
  value: string;
  label: string;
}

export interface AuthSession {
  token: string;
  expiresAt: Date;
  masterPassword?: string;
  needsMasterPassword?: boolean;
  unwrappedMasterPassword?: string;
}

export interface FinancialDataBranch {
  sales: CandySale[];
  expenses: Expense[];
}

export interface FinancialData {
  branches: {
    main: FinancialDataBranch;
    preview: FinancialDataBranch;
  };
}

export interface SalesAnalytics {
  totalRevenue: number;
  totalUnits: number;
  avgOrderValue: number;
  revenueByProduct: Array<[string, number]>;
  unitsByProduct: Array<[string, number]>;
}


export type AuthMethod = 'password' | 'passkey' | 'totp';

export interface Employee {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  phoneNumber?: string;
  isActive: boolean;
  createdAt: string | Date;
  status?: 'pending' | 'approved' | 'rejected';
  profitPercent?: number;
}

export type InventoryItemCategory = 'equipment' | 'candy' | 'supplies';

export interface InventoryAssignment {
  employeeId: string;
  employeeName: string;
  quantity: number;
  sold?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryItemCategory;
  description?: string;
  unitValue: number; // Monetary value per unit (sell price)
  originalCost: number; // Per-unit cost of goods (for payroll calculation)
  quantity: number; // Total stock
  unit: 'pcs' | 'mg' | 'grams' | 'kg' | 'oz';
  assignments?: InventoryAssignment[]; // Partial assignments per employee
  notes?: string;
  flexiblePrice?: boolean;
  flexibilityPercent?: number;
  maxPriceCap?: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  craftable?: boolean;
  costOverride?: number;
  promoPricing?: { tiers: { qty: number; price: number }[] };
}

export interface CraftingRecipe {
  id: string;
  outputItemId: string;       // ID of the craftable item produced
  outputQuantity: number;     // How many units produced
  outputItemName?: string;    // Enriched field
  outputItemUnit?: string;    // Enriched field 
  ingredients: {
    itemId: string;           // ID of ingredient
    quantity: number;         // Quantity consumed per craft
    ingredientName?: string;  // Enriched field
  }[];
  reversible?: boolean;       // Can this craft be undone?
  salvageQuantity?: {         // Map of itemId -> exactly how much quantity is returned if reversed
    [itemId: string]: number;
  };
  visibility?: 'public' | 'private';
  allowedStaffIds?: string[];
  createdAt: string | Date;
}

export type RefundReason = 'calidad' | 'venta_por_error' | 'venta_cancelada' | 'inventory_loss';
export type RefundStatus = 'pending' | 'approved_with_return' | 'approved_without_return' | 'rejected' | 'approved_loss';

export interface ReportItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  originalCost: number;
  value: number;
  lossType?: 'return_to_master' | 'full' | 'partial' | 'desmantelar';
  actionTaken?: 'burn' | 'unassign';
}

export interface RefundRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  status: RefundStatus;

  // Encrypted payload fields (only available after decryption)
  reason?: RefundReason;
  lossType?: 'return_to_master' | 'full' | 'partial' | 'desmantelar';
  note?: string;
  saleRecordId?: string;
  reportItems?: ReportItem[];
  
  // Legacy single-item payload fields
  itemId?: string;
  itemName?: string;
  qtySold?: number;
  refundQty?: number;
  quantity?: number; // Quantity lost (inventory_loss specific)
  saleValue?: number;
  originalCost?: number;
  unit?: string;
  soldAt?: string;
  isCorrupted?: boolean;

  // Metadata
  createdAt: string;
  resolvedAt?: string;
}


export type TransactionType = 'assign' | 'unassign' | 'adjust' | 'add' | 'remove';

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantityChange: number;
  valueChange: number;
  performedBy: string; // User ID of admin/owner
  employeeId?: string; // Affected employee
  employeeName?: string;
  notes?: string;
  createdAt: string | Date;
}
