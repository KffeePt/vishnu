'use client'
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface AppState {
  step: number;
}

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const defaultState: AppState = {
  step: 0,
};

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppWrapper = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(defaultState);

  return (
    <AppContext.Provider value={{ state, setState }}>
      {children}
    </AppContext.Provider>
  );
};

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppWrapper');
  }
  return context;
}