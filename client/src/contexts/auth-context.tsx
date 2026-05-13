import { createContext, useContext } from 'react';

type Tier = 'guest' | 'free' | 'premium';

export interface AuthContextValue {
  isLoggedIn: boolean;
  isLoading: boolean;
  tier: Tier;
  user: { id?: string; email?: string; name?: string } | null;
  clerkUserId: string | null;
}

export const defaultAuthState: AuthContextValue = {
  isLoggedIn: false,
  isLoading: false,
  tier: 'guest',
  user: null,
  clerkUserId: null,
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthState);

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
