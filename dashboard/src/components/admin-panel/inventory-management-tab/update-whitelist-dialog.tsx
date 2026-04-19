"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from '@/lib/client-auth';
import { Loader2, Users, Check, Search } from 'lucide-react';
import { Input } from "@/components/ui/input";

interface UpdateWhitelistDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipe: any | null;
    staffList: { id: string, name: string, role: string }[];
    onUpdated?: () => void;
}

export function UpdateWhitelistDialog({ open, onOpenChange, recipe, staffList, onUpdated }: UpdateWhitelistDialogProps) {
    const [allowedStaffIds, setAllowedStaffIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (open && recipe) {
            setAllowedStaffIds(recipe.allowedStaffIds || []);
            setSearchQuery('');
        }
    }, [open, recipe]);

    const handleToggleStaff = (staffId: string) => {
        setAllowedStaffIds(prev =>
            prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
        );
    };

    const handleSelectAll = () => {
        if (allowedStaffIds.length === staffList.length) {
            setAllowedStaffIds([]);
        } else {
            setAllowedStaffIds(staffList.map(s => s.id));
        }
    };

    const handleSubmit = async () => {
        if (!recipe) return;
        setIsSubmitting(true);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Authentication failed");

            const res = await fetch('/api/admin/recipes/whitelist', {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    recipeId: recipe.id,
                    allowedStaffIds
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to update whitelist');
            }

            toast({ title: 'Success', description: 'Recipe whitelist updated successfully. Triggering staff sink...' });
            
            // Trigger auto-sync across all staff like assignment panel does
            window.dispatchEvent(new CustomEvent('trigger-force-push-all'));
            if (onUpdated) onUpdated();
            onOpenChange(false);
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredStaff = staffList.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.role.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Manage Recipe Access
                    </DialogTitle>
                    <DialogDescription>
                        Select which staff members can view and craft from the private recipe: <strong>{recipe?.outputItemName || 'Selected Recipe'}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search staff members..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <span className="text-sm font-medium">{allowedStaffIds.length} staff selected</span>
                        <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-8 text-xs">
                            {allowedStaffIds.length === staffList.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>

                    <div className="border rounded-md overflow-hidden bg-muted/20">
                        <div className="max-h-[300px] overflow-y-auto p-1 divide-y divide-border/50">
                            {filteredStaff.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">No staff found matching search.</div>
                            ) : (
                                filteredStaff.map(staff => {
                                    const isSelected = allowedStaffIds.includes(staff.id);
                                    return (
                                        <div 
                                            key={staff.id}
                                            onClick={() => handleToggleStaff(staff.id)}
                                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{staff.name}</span>
                                                <span className="text-xs text-muted-foreground capitalize">{staff.role}</span>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background text-transparent'}`}>
                                                <Check className="h-3 w-3" />
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-amber-500/10 border-amber-500/20 border text-amber-600 dark:text-amber-400 p-3 rounded-md text-xs flex items-start gap-2">
                        <Users className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>Updating the whitelist will re-encrypt the recipe and force a push to all staff members to ensure access changes take effect immediately.</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Access & Push
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
