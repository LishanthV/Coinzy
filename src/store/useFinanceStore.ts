import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, Budget, Category, Transaction } from '../types';
import { seedAccounts, seedBudgets, seedCategories, seedTransactions } from '../data/seedData';
import { generateId, isSameMonth } from '../utils/format';

export interface UserFinanceData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  userStorage: Record<string, UserFinanceData>;
  currentUserId: string | null;

  // Transactions
  addTransaction: (txn: Omit<Transaction, 'id'>) => Promise<void>;
  updateTransaction: (id: string, changes: Partial<Omit<Transaction, 'id'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Budgets
  setBudget: (categoryId: string, limit: number) => Promise<void>;
  removeBudget: (categoryId: string) => Promise<void>;

  // Accounts
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;

  // Derived
  resetToSeed: () => Promise<void>;

  // User Loading
  loadUserData: (userId: string, token?: string) => Promise<void>;
  clearUserData: () => void;
}

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

const getAuthHeaders = (overrideToken?: string) => {
  // Lazily require useAuthStore to prevent circular dependency evaluation issues at bundle startup
  const token = overrideToken || require('./useAuthStore').useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

function applyBalanceDelta(accounts: Account[], txn: Omit<Transaction, 'id'>, sign: 1 | -1): Account[] {
  return accounts.map((acc) => {
    let delta = 0;
    if (txn.type === 'income' && acc.id === txn.accountId) delta = txn.amount;
    if (txn.type === 'expense' && acc.id === txn.accountId) delta = -txn.amount;
    if (txn.type === 'transfer') {
      if (acc.id === txn.accountId) delta = -txn.amount;
      if (acc.id === txn.toAccountId) delta = txn.amount;
    }
    return delta ? { ...acc, balance: acc.balance + delta * sign } : acc;
  });
}

// Helper to update both active state and persistent userStorage in one go
const updateStateAndStorage = (
  set: any,
  updater: (state: FinanceState) => Partial<FinanceState>
) => {
  set((state: FinanceState) => {
    const updated = updater(state);
    const finalState = { ...state, ...updated };

    if (finalState.currentUserId) {
      return {
        ...updated,
        userStorage: {
          ...finalState.userStorage,
          [finalState.currentUserId]: {
            accounts: finalState.accounts,
            categories: finalState.categories,
            transactions: finalState.transactions,
            budgets: finalState.budgets,
          },
        },
      };
    }
    return updated;
  });
};

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
      categories: seedCategories,
      transactions: [],
      budgets: [],
      userStorage: {},
      currentUserId: null,

      addTransaction: async (txn) => {
        const tempId = generateId('txn');
        const finalTxn = { ...txn, id: tempId };

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          transactions: [finalTxn, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, txn, 1),
        }));

        try {
          console.log('[Finance Store] Syncing addTransaction to MySQL...');
          const response = await fetch(`${backendUrl}/api/transactions`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(finalTxn),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] addTransaction API Sync failed; stored in offline queue.', error);
        }
      },

      updateTransaction: async (id, changes) => {
        let originalTxn: Transaction | undefined;

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return {};
          originalTxn = existing;
          let accounts = applyBalanceDelta(state.accounts, existing, -1);
          const updated = { ...existing, ...changes };
          accounts = applyBalanceDelta(accounts, updated, 1);
          return {
            accounts,
            transactions: state.transactions.map((t) => (t.id === id ? updated : t)),
          };
        });

        if (!originalTxn) return;

        try {
          console.log('[Finance Store] Syncing updateTransaction to MySQL...');
          const finalTxn = { ...originalTxn, ...changes };
          const response = await fetch(`${backendUrl}/api/transactions/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(finalTxn),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] updateTransaction API Sync failed.', error);
        }
      },

      deleteTransaction: async (id) => {
        let originalTxn: Transaction | undefined;

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return {};
          originalTxn = existing;
          const accounts = applyBalanceDelta(state.accounts, existing, -1);
          return {
            accounts,
            transactions: state.transactions.filter((t) => t.id !== id),
          };
        });

        if (!originalTxn) return;

        try {
          console.log('[Finance Store] Syncing deleteTransaction to MySQL...');
          const response = await fetch(`${backendUrl}/api/transactions/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] deleteTransaction API Sync failed.', error);
        }
      },

      setBudget: async (categoryId, limit) => {
        const tempId = generateId('bud');
        const budgetItem: Budget = { id: tempId, categoryId, limit, period: 'monthly' };

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => {
          const existing = state.budgets.find((b) => b.categoryId === categoryId);
          if (existing) {
            return {
              budgets: state.budgets.map((b) => (b.categoryId === categoryId ? { ...b, limit } : b)),
            };
          }
          return {
            budgets: [...state.budgets, budgetItem],
          };
        });

        try {
          console.log('[Finance Store] Syncing setBudget to MySQL...');
          const response = await fetch(`${backendUrl}/api/budgets`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(budgetItem),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] setBudget API Sync failed.', error);
        }
      },

      removeBudget: async (categoryId) => {
        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          budgets: state.budgets.filter((b) => b.categoryId !== categoryId),
        }));

        try {
          console.log('[Finance Store] Syncing removeBudget to MySQL...');
          const response = await fetch(`${backendUrl}/api/budgets/${categoryId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] removeBudget API Sync failed.', error);
        }
      },

      addAccount: async (account) => {
        const tempId = generateId('acc');
        const finalAccount = { ...account, id: tempId };

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          accounts: [...state.accounts, finalAccount],
        }));

        try {
          console.log('[Finance Store] Syncing addAccount to MySQL...');
          const response = await fetch(`${backendUrl}/api/accounts`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(finalAccount),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] addAccount API Sync failed.', error);
        }
      },

      resetToSeed: async () => {
        updateStateAndStorage(set, () => ({
          accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
          categories: seedCategories,
          transactions: [],
          budgets: [],
        }));

        try {
          console.log('[Finance Store] Syncing resetToSeed to MySQL...');
          const response = await fetch(`${backendUrl}/api/data/reset`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });
          if (!response.ok) throw new Error('API Sync Failed');
        } catch (error) {
          console.warn('[Finance Store] resetToSeed API Sync failed.', error);
        }
      },

      loadUserData: async (userId, token) => {
        console.log(`[Finance Store] Fetching database records from MySQL for User: ${userId}`);
        try {
          const headers = getAuthHeaders(token);
          
          const [accountsRes, budgetsRes, transactionsRes] = await Promise.all([
            fetch(`${backendUrl}/api/accounts`, { headers }),
            fetch(`${backendUrl}/api/budgets`, { headers }),
            fetch(`${backendUrl}/api/transactions`, { headers }),
          ]);

          if (!accountsRes.ok || !budgetsRes.ok || !transactionsRes.ok) {
            throw new Error('Database server query failed.');
          }

          const accounts = await accountsRes.json();
          const budgets = await budgetsRes.json();
          const transactions = await transactionsRes.json();

          set({
            currentUserId: userId,
            accounts,
            budgets,
            transactions,
          });
        } catch (error) {
          console.warn('[Finance Store] Failed to load data from MySQL server. Falling back to local cache.', error);
          
          // Offline fallback
          set((state) => {
            const userData = state.userStorage[userId] || {
              accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
              categories: seedCategories,
              transactions: [],
              budgets: [],
            };
            return {
              currentUserId: userId,
              accounts: userData.accounts,
              categories: userData.categories,
              transactions: userData.transactions,
              budgets: userData.budgets,
            };
          });
        }
      },

      clearUserData: () =>
        set((state) => {
          console.log(`[Finance Store] Clearing active state for User ID: ${state.currentUserId}`);
          let userStorage = { ...state.userStorage };
          if (state.currentUserId) {
            userStorage[state.currentUserId] = {
              accounts: state.accounts,
              categories: state.categories,
              transactions: state.transactions,
              budgets: state.budgets,
            };
          }
          return {
            currentUserId: null,
            userStorage,
            accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
            categories: seedCategories,
            transactions: [],
            budgets: [],
          };
        }),
    }),
    {
      name: 'coinzy-finance-v3',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
