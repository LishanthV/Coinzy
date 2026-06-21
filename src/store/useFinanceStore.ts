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
  addTransaction: (txn: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, changes: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransaction: (id: string) => void;

  // Budgets
  setBudget: (categoryId: string, limit: number) => void;
  removeBudget: (categoryId: string) => void;

  // Accounts
  addAccount: (account: Omit<Account, 'id'>) => void;

  // Derived
  resetToSeed: () => void;

  // User Loading
  loadUserData: (userId: string) => void;
  clearUserData: () => void;
}

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

      addTransaction: (txn) =>
        updateStateAndStorage(set, (state) => ({
          transactions: [{ ...txn, id: generateId('txn') }, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, txn, 1),
        })),

      updateTransaction: (id, changes) =>
        updateStateAndStorage(set, (state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return {};
          let accounts = applyBalanceDelta(state.accounts, existing, -1);
          const updated = { ...existing, ...changes };
          accounts = applyBalanceDelta(accounts, updated, 1);
          return {
            accounts,
            transactions: state.transactions.map((t) => (t.id === id ? updated : t)),
          };
        }),

      deleteTransaction: (id) =>
        updateStateAndStorage(set, (state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return {};
          const accounts = applyBalanceDelta(state.accounts, existing, -1);
          return {
            accounts,
            transactions: state.transactions.filter((t) => t.id !== id),
          };
        }),

      setBudget: (categoryId, limit) =>
        updateStateAndStorage(set, (state) => {
          const existing = state.budgets.find((b) => b.categoryId === categoryId);
          if (existing) {
            return {
              budgets: state.budgets.map((b) => (b.categoryId === categoryId ? { ...b, limit } : b)),
            };
          }
          return {
            budgets: [...state.budgets, { id: generateId('bud'), categoryId, limit, period: 'monthly' }],
          };
        }),

      removeBudget: (categoryId) =>
        updateStateAndStorage(set, (state) => ({
          budgets: state.budgets.filter((b) => b.categoryId !== categoryId),
        })),

      addAccount: (account) =>
        updateStateAndStorage(set, (state) => ({
          accounts: [...state.accounts, { ...account, id: generateId('acc') }],
        })),

      resetToSeed: () =>
        updateStateAndStorage(set, () => ({
          accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
          categories: seedCategories,
          transactions: [],
          budgets: [],
        })),

      loadUserData: (userId) =>
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
        }),

      clearUserData: () =>
        set((state) => {
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
      name: 'coinzy-finance-v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
