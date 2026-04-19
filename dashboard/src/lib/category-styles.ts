export function getCategoryCardClass(category?: string, isCraftable?: boolean): string {
  if (isCraftable) {
    return 'border-transparent bg-gradient-to-r from-orange-500/20 via-amber-500/30 to-orange-500/20 bg-[length:200%_200%] animate-gradient-shift shadow-[0_0_10px_rgba(249,115,22,0.2)] hover:shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:scale-[1.01] transition-all relative before:absolute before:inset-0 before:p-[1px] before:bg-gradient-to-r before:from-orange-500 before:via-amber-400 before:to-orange-500 before:-z-10 before:rounded-xl before:animate-gradient-shift before:content-[\'\']';
  }
  
  if (!category) return 'border-border/50 bg-muted/20 hover:border-primary/30';
  
  const normalized = category.toLowerCase();
  
  if (normalized === 'equipment') {
    return 'border-transparent bg-gradient-to-r from-custom-brown/30 via-custom-mid-beige/40 to-custom-gold/30 bg-[length:200%_200%] animate-gradient-shift shadow-[0_0_10px_rgba(201,140,24,0.2)] hover:shadow-[0_0_15px_rgba(201,140,24,0.4)] hover:scale-[1.01] transition-all relative before:absolute before:inset-0 before:p-[1px] before:bg-gradient-to-r before:from-custom-brown before:via-custom-gold before:to-custom-brown before:-z-10 before:rounded-xl before:animate-gradient-shift before:content-[\'\']';
  }
  
  if (normalized === 'candy') {
    return 'border-transparent bg-gradient-to-r from-purple-500/20 via-fuchsia-500/30 to-pink-500/20 bg-[length:200%_200%] animate-gradient-shift shadow-[0_0_10px_rgba(217,70,239,0.2)] hover:shadow-[0_0_15px_rgba(217,70,239,0.4)] hover:scale-[1.01] transition-all relative before:absolute before:inset-0 before:p-[1px] before:bg-gradient-to-r before:from-purple-500 before:via-pink-500 before:to-purple-500 before:-z-10 before:rounded-xl before:animate-gradient-shift before:content-[\'\']';
  }
  
  if (normalized === 'supplies') {
    return 'border-transparent bg-gradient-to-r from-lime-500/20 via-emerald-500/30 to-green-500/20 bg-[length:200%_200%] animate-gradient-shift shadow-[0_0_10px_rgba(132,204,22,0.2)] hover:shadow-[0_0_15px_rgba(132,204,22,0.4)] hover:scale-[1.01] transition-all relative before:absolute before:inset-0 before:p-[1px] before:bg-gradient-to-r before:from-lime-500 before:via-emerald-500 before:to-lime-500 before:-z-10 before:rounded-xl before:animate-gradient-shift before:content-[\'\']';
  }

  // Fallback for unknown categories
  return 'border-border/50 bg-muted/20 hover:border-primary/30';
}

export function getCategoryBadgeClass(category?: string, isCraftable?: boolean): string {
  if (isCraftable) {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 border-orange-200 dark:border-orange-700 font-bold';
  }

  if (!category) return 'bg-muted text-muted-foreground';
  
  const normalized = category.toLowerCase();
  
  if (normalized === 'equipment') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-200 dark:border-amber-700 font-bold';
  }
  
  if (normalized === 'candy') {
    return 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/60 dark:text-fuchsia-200 border-fuchsia-200 dark:border-fuchsia-700 font-bold';
  }
  
  if (normalized === 'supplies') {
    return 'bg-lime-100 text-lime-800 dark:bg-lime-900/60 dark:text-lime-200 border-lime-200 dark:border-lime-700 font-bold';
  }

  return 'bg-primary/10 text-primary border-primary/20 font-bold';
}
