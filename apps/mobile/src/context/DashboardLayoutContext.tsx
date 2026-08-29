import React, { createContext, useContext, useState, useCallback } from 'react';

export type DashboardLayoutMode = 'grid' | 'sections';

interface DashboardLayoutContextValue {
  layoutMode: DashboardLayoutMode;
  setLayoutMode: (mode: DashboardLayoutMode) => void;
  toggleLayoutMode: () => void;
  collapsedSections: Record<string, boolean>;
  toggleSectionCollapse: (sectionId: string) => void;
  isSectionCollapsed: (sectionId: string) => boolean;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | undefined>(undefined);

export function DashboardLayoutProvider({ children }: { children: React.ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<DashboardLayoutMode>('grid');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const setLayoutMode = useCallback((mode: DashboardLayoutMode) => {
    setLayoutModeState(mode);
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setLayoutModeState((prev) => (prev === 'grid' ? 'sections' : 'grid'));
  }, []);

  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const isSectionCollapsed = useCallback(
    (sectionId: string) => Boolean(collapsedSections[sectionId]),
    [collapsedSections]
  );

  return (
    <DashboardLayoutContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        toggleLayoutMode,
        collapsedSections,
        toggleSectionCollapse,
        isSectionCollapsed,
      }}
    >
      {children}
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout() {
  const ctx = useContext(DashboardLayoutContext);
  if (!ctx) {
    throw new Error('useDashboardLayout must be used within a DashboardLayoutProvider');
  }
  return ctx;
}
