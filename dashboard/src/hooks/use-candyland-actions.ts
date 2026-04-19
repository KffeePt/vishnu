import { useState } from 'react';
import { UserAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { CandyProduct, AuthSession } from '@/types/candyland';

interface UseCandylandActionsProps {
  authSession: AuthSession | null;
  refreshData: () => void;
}

export function useCandylandActions({ authSession, refreshData }: UseCandylandActionsProps) {
  const { getIDToken } = UserAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingSale, setIsDeletingSale] = useState(false);

  const createApiCall = async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const idToken = await getIDToken();
    if (!idToken) {
      console.error('No authentication token available');
      throw new Error('No authentication token');
    }

    console.log(`Making API call to ${endpoint} with method ${options.method || 'GET'}`);

    return fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        ...options.headers,
      },
      ...options,
    });
  };

  const handleAddOrUpdateProduct = async (productData: Omit<CandyProduct, 'id'> | CandyProduct) => {
    if (!authSession) return;
    setIsSubmitting(true);

    const isUpdating = 'id' in productData;
    const url = isUpdating ? `/api/admin/system/products?id=${productData.id}` : '/api/admin/system/products';
    const method = isUpdating ? 'PUT' : 'POST';

    try {
      const response = await createApiCall(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });

      if (response.ok) {
        toast({ title: `Product ${isUpdating ? 'updated' : 'added'} successfully` });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        toast({ title: `Failed to ${isUpdating ? 'update' : 'add'} product`, description: error.error, variant: 'destructive' });
        return false;
      }
    } catch (error) {
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product: CandyProduct) => {
    if (!authSession || !product) return false;

    try {
      const response = await createApiCall(`/api/admin/system/products?id=${product.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({ title: 'Product deleted successfully' });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        toast({ title: 'Failed to delete product', description: error.error, variant: 'destructive' });
        return false;
      }
    } catch (error) {
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
      return false;
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    if (!authSession) return false;
    setIsDeletingSale(true);

    try {
      const response = await createApiCall(`/api/admin/finances/sales?id=${saleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({ title: 'Sale record deleted successfully' });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        toast({ title: 'Failed to delete sale', description: error.error, variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
      return false;
    } finally {
      setIsDeletingSale(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!authSession) return false;

    try {
      const response = await createApiCall(`/api/admin/finances/expenses?id=${expenseId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({ title: 'Expense record deleted successfully' });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        toast({ title: 'Failed to delete expense', description: error.error, variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
      return false;
    }
  };

  const handleAddExpenseCategory = async (categoryData: { name: string; description?: string }) => {
    if (!authSession) {
      toast({ title: 'No authentication session available', variant: 'destructive' });
      return false;
    }

    try {
      const response = await createApiCall('/api/admin/finances/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData),
      });

      if (response.ok) {
        toast({ title: 'Expense category added successfully' });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        console.error('API Error:', error);
        toast({ title: 'Failed to add expense category', description: error.error || 'Unknown error', variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error("Error adding expense category:", error);
      toast({ title: 'Network error occurred', description: 'Please check your connection', variant: 'destructive' });
      return false;
    }
  };

  const handleClearData = async () => {
    if (!authSession) return false;

    try {
      const response = await createApiCall('/api/admin/clear-data', {
        method: 'POST',
      });

      if (response.ok) {
        toast({ title: 'Data cleared successfully' });
        refreshData();
        return true;
      } else {
        const error = await response.json();
        toast({ title: 'Failed to clear data', description: error.error, variant: 'destructive' });
        return false;
      }
    } catch (error) {
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
      return false;
    }
  };

  return {
    isSubmitting,
    isDeletingSale,
    handleAddOrUpdateProduct,
    handleDeleteProduct,
    handleDeleteSale,
    handleDeleteExpense,
    handleAddExpenseCategory,
    handleClearData,
  };
}