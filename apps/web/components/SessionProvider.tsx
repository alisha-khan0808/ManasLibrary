'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  hasPermission,
  type AppUser,
  type Branch,
  type Permission,
} from '@manas/shared';

interface SessionValue {
  user: AppUser;
  /** Branches this user may operate on, already filtered by the API. */
  branches: Branch[];
  can: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  branches,
  children,
}: {
  user: AppUser;
  branches: Branch[];
  children: ReactNode;
}) {
  const value: SessionValue = {
    user,
    branches,
    // Mirrors the API's permission map. This only decides what to render —
    // the API re-checks every request regardless of what the UI shows.
    can: (permission) => hasPermission(user.role, permission),
    isSuperAdmin: user.role === 'SUPER_ADMIN',
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return context;
}
