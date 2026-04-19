import { useState, useEffect } from 'react';
import { UserAuth } from '@/context/auth-context';
import { CandySale, CandyProduct, ExpenseCategory, Expense, AuthSession } from '@/types/candyland';

interface UseCandylandDataProps {
  authSession: AuthSession | null;
  user: any;
}

export function useCandylandData({ authSession, user }: UseCandylandDataProps) {
  const { getIDToken } = UserAuth();

  const [sales, setSales] = useState<CandySale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<CandyProduct[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);

  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [isExpensesLoading, setIsExpensesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isExpenseCategoriesLoading, setIsExpenseCategoriesLoading] = useState(true);

  const createApiCall = async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const idToken = await getIDToken();
    if (!idToken) {
      throw new Error('No authentication token');
    }

    return fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        ...options.headers,
      },
      ...options,
    });
  };

  const fetchSales = async () => {
    try {
      setIsSalesLoading(true);
      const response = await createApiCall('/api/admin/finances/sales');
      if (response.ok) {
        const data = await response.json();
        setSales(data.sales || []);
      } else {
        console.error("Failed to fetch sales");
      }
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setIsSalesLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setIsProductsLoading(true);
      const response = await createApiCall('/api/admin/system/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      } else {
        console.error("Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsProductsLoading(false);
    }
  };

  const fetchExpenses = async () => {
    try {
      setIsExpensesLoading(true);
      const response = await createApiCall('/api/admin/finances/expenses');
      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
      } else {
        console.error("Failed to fetch expenses");
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsExpensesLoading(false);
    }
  };

  const fetchExpenseCategories = async () => {
    try {
      setIsExpenseCategoriesLoading(true);
      const response = await createApiCall('/api/admin/finances/expense-categories');
      if (response.ok) {
        const data = await response.json();
        setExpenseCategories(data.expenseCategories || []);
      } else {
        console.error("Failed to fetch expense categories");
      }
    } catch (error) {
      console.error("Error fetching expense categories:", error);
    } finally {
      setIsExpenseCategoriesLoading(false);
    }
  };

  const refreshAllData = () => {
    fetchSales();
    fetchExpenses();
    fetchProducts();
    fetchExpenseCategories();
  };

  useEffect(() => {
    if (authSession && authSession.token && user) {
      refreshAllData();
    }
  }, [authSession, user]);

  return {
    sales,
    expenses,
    products,
    expenseCategories,
    isSalesLoading,
    isExpensesLoading,
    isProductsLoading,
    isExpenseCategoriesLoading,
    fetchSales,
    fetchProducts,
    fetchExpenses,
    fetchExpenseCategories,
    refreshAllData,
    createApiCall,
  };
}