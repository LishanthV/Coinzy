import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, Budget, Category, Transaction } from '../types';
import { seedAccounts, seedBudgets, seedCategories, seedTransactions } from '../data/seedData';
import { generateId, isSameMonth } from '../utils/format';

interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];

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

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
      categories: seedCategories,
      transactions: [],
      budgets: [],

      addTransaction: (txn) =>
        set((state) => ({
          transactions: [{ ...txn, id: generateId('txn') }, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, txn, 1),
        })),

      updateTransaction: (id, changes) =>
        set((state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return state;
          // revert old effect, apply new
          let accounts = applyBalanceDelta(state.accounts, existing, -1);
          const updated = { ...existing, ...changes };
          accounts = applyBalanceDelta(accounts, updated, 1);
          return {
            accounts,
            transactions: state.transactions.map((t) => (t.id === id ? updated : t)),
          };
        }),

      deleteTransaction: (id) =>
        set((state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return state;
          const accounts = applyBalanceDelta(state.accounts, existing, -1);
          return {
            accounts,
            transactions: state.transactions.filter((t) => t.id !== id),
          };
        }),

      setBudget: (categoryId, limit) =>
        set((state) => {
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
        set((state) => ({
          budgets: state.budgets.filter((b) => b.categoryId !== categoryId),
        })),

      addAccount: (account) =>
        set((state) => ({
          accounts: [...state.accounts, { ...account, id: generateId('acc') }],
        })),


      resetToSeed: () =>
        set({
          accounts: seedAccounts.map((acc) => ({ ...acc, balance: 0 })),
          categories: seedCategories,
          transactions: [],
          budgets: [],
        }),
    }),
    {
      name: 'coinzy-finance',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
