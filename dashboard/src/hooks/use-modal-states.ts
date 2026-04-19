import { useState } from 'react';
import { CandyProduct } from '@/types/candyland';

export function useModalStates() {
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isExpenseCategoryDialogOpen, setIsExpenseCategoryDialogOpen] = useState(false);
  const [isClearDataDialogOpen, setIsClearDataDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CandyProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<CandyProduct | null>(null);

  return {
    isProductDialogOpen,
    setIsProductDialogOpen,
    isExpenseCategoryDialogOpen,
    setIsExpenseCategoryDialogOpen,
    isClearDataDialogOpen,
    setIsClearDataDialogOpen,
    editingProduct,
    setEditingProduct,
    deletingProduct,
    setDeletingProduct,
  };
}