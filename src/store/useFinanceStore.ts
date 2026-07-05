import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, Budget, Category, Transaction, SavingsGoal } from '../types';
import { defaultAccounts, defaultCategories } from '../constants/defaults';
import { generateId, isSameMonth } from '../utils/format';

export interface UserFinanceData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals?: SavingsGoal[];
}

export interface SyncAction {
  id: string;
  action: 'SAVE_TXN' | 'DELETE_TXN' | 'SAVE_ACC' | 'SAVE_BUDGET' | 'DELETE_BUDGET' | 'SAVE_GOAL' | 'DELETE_GOAL';
  payload: any;
  timestamp: number;
  retryCount: number;
}

export interface RecurringRule {
  id: string;
  accountId: string;
  type: 'income' | 'expense';
  amount: number;
  categoryId?: string;
  note?: string;
  merchant?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDueDate: string;
  lastProcessed?: string;
  isActive: number;
  updatedAt: number;
}

interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  userStorage: Record<string, UserFinanceData>;
  currentUserId: string | null;
  syncQueue: SyncAction[];
  deadLetterQueue: SyncAction[];
  isSyncing: boolean;
  recurringRules: RecurringRule[];

  // Transactions
  addTransaction: (txn: Omit<Transaction, 'id' | 'updatedAt'>) => Promise<void>;
  updateTransaction: (id: string, changes: Partial<Omit<Transaction, 'id' | 'updatedAt'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Budgets
  setBudget: (categoryId: string, limit: number) => Promise<void>;
  removeBudget: (categoryId: string) => Promise<void>;

  // Accounts
  addAccount: (account: Omit<Account, 'id' | 'updatedAt'>) => Promise<void>;

  // Recurring
  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'updatedAt' | 'isActive'>) => Promise<void>;
  deleteRecurringRule: (id: string) => Promise<void>;

  // Goals
  addGoal: (goal: Omit<SavingsGoal, 'id' | 'updatedAt'>) => Promise<void>;
  updateGoal: (id: string, changes: Partial<Omit<SavingsGoal, 'id' | 'updatedAt'>>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  // Derived
  resetToSeed: () => Promise<void>;

  // User Loading
  loadUserData: (userId: string, token?: string) => Promise<void>;
  clearUserData: () => void;
  triggerSync: () => Promise<void>;
}

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const authStore = require('./useAuthStore').useAuthStore;
  let token = authStore.getState().accessToken; // This is the access token

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
    'bypass-tunnel-reminder': 'true',
    ...options.headers,
  };

  let response = await fetch(url, { ...options, headers });

  // If access token is invalid/expired (401), try to refresh
  if (response.status === 401 && authStore.getState().refreshToken) {
    console.log('[Finance Store] Access token expired (401), attempting to refresh session...');
    const refreshed = await authStore.getState().refreshAccessToken();
    if (refreshed) {
      // Retry request with the new access token
      const newToken = authStore.getState().accessToken;
      const retriedHeaders = {
        ...headers,
        'Authorization': newToken ? `Bearer ${newToken}` : '',
      };
      console.log('[Finance Store] Token refreshed successfully, retrying original request...');
      response = await fetch(url, { ...options, headers: retriedHeaders });
    } else {
      // Refresh failed, logout user
      console.warn('[Finance Store] Token refresh failed, logging out user...');
      await authStore.getState().logOut();
    }
  }
  return response;
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
            goals: finalState.goals,
          },
        },
      };
    }
    return updated;
  });
};

// Helper to merge local and server lists with Last-Write-Wins (LWW)
function mergeRecords<T extends { id: string; updatedAt?: number }>(localList: T[], serverList: T[]): T[] {
  const mergedMap = new Map<string, T>();

  // Add server records first
  serverList.forEach((rec) => {
    mergedMap.set(rec.id, rec);
  });

  // Compare with local records
  localList.forEach((localRec) => {
    const serverRec = mergedMap.get(localRec.id);
    if (!serverRec) {
      mergedMap.set(localRec.id, localRec);
    } else {
      const localTime = Number(localRec.updatedAt || 0);
      const serverTime = Number(serverRec.updatedAt || 0);
      if (localTime > serverTime) {
        mergedMap.set(localRec.id, localRec);
      }
    }
  });

  return Array.from(mergedMap.values());
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      accounts: defaultAccounts.map((acc) => ({ ...acc, balance: 0 })),
      categories: defaultCategories,
      transactions: [],
      budgets: [],
      goals: [],
      userStorage: {},
      currentUserId: null,
      syncQueue: [],
      deadLetterQueue: [],
      isSyncing: false,
      recurringRules: [],

      addTransaction: async (txn) => {
        const tempId = generateId('txn');
        const now = Date.now();
        const finalTxn: Transaction = { ...txn, id: tempId, updatedAt: now };

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          transactions: [finalTxn, ...state.transactions],
          accounts: applyBalanceDelta(state.accounts, finalTxn, 1),
        }));

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_TXN',
          payload: finalTxn,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing addTransaction to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/transactions`, {
            method: 'POST',
            body: JSON.stringify(finalTxn),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] addTransaction API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      updateTransaction: async (id, changes) => {
        let updatedTxn: Transaction | undefined;
        const now = Date.now();

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => {
          const existing = state.transactions.find((t) => t.id === id);
          if (!existing) return {};
          let accounts = applyBalanceDelta(state.accounts, existing, -1);
          updatedTxn = { ...existing, ...changes, updatedAt: now };
          accounts = applyBalanceDelta(accounts, updatedTxn, 1);
          return {
            accounts,
            transactions: state.transactions.map((t) => (t.id === id ? updatedTxn! : t)),
          };
        });

        if (!updatedTxn) return;

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_TXN',
          payload: updatedTxn,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing updateTransaction to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/transactions`, {
            method: 'POST',
            body: JSON.stringify(updatedTxn),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] updateTransaction API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
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

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'DELETE_TXN',
          payload: { id },
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing deleteTransaction to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/transactions/${id}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] deleteTransaction API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      setBudget: async (categoryId, limit) => {
        const now = Date.now();
        let budgetItem: Budget;

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => {
          const existing = state.budgets.find((b) => b.categoryId === categoryId);
          if (existing) {
            budgetItem = { ...existing, limit, updatedAt: now };
            return {
              budgets: state.budgets.map((b) => (b.categoryId === categoryId ? budgetItem : b)),
            };
          } else {
            const tempId = generateId('bud');
            budgetItem = { id: tempId, categoryId, limit, period: 'monthly', updatedAt: now };
            return {
              budgets: [...state.budgets, budgetItem],
            };
          }
        });

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_BUDGET',
          payload: budgetItem!,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing setBudget to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/budgets`, {
            method: 'POST',
            body: JSON.stringify(budgetItem!),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] setBudget API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      removeBudget: async (categoryId) => {
        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          budgets: state.budgets.filter((b) => b.categoryId !== categoryId),
        }));

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'DELETE_BUDGET',
          payload: { categoryId },
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing removeBudget to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/budgets/${categoryId}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] removeBudget API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      addAccount: async (account) => {
        const tempId = generateId('acc');
        const now = Date.now();
        const finalAccount: Account = { ...account, id: tempId, updatedAt: now };

        // Optimistically update UI locally
        updateStateAndStorage(set, (state) => ({
          accounts: [...state.accounts, finalAccount],
        }));

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_ACC',
          payload: finalAccount,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing addAccount to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/accounts`, {
            method: 'POST',
            body: JSON.stringify(finalAccount),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] addAccount API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      resetToSeed: async () => {
        try {
          console.log('[Finance Store] Syncing resetToSeed to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/data/reset`, {
            method: 'POST',
          });
          if (!response.ok) throw new Error('API Sync Failed');

          const userId = get().currentUserId;
          const mappedAccounts = defaultAccounts.map((acc) => ({
            ...acc,
            id: userId ? `${acc.id}_${userId}` : acc.id,
            balance: 0,
            updatedAt: Date.now(),
          }));

          updateStateAndStorage(set, () => ({
            accounts: mappedAccounts,
            categories: defaultCategories,
            transactions: [],
            budgets: [],
          }));
        } catch (error) {
          console.warn('[Finance Store] resetToSeed API Sync failed.', error);
          throw error;
        }
      },

      loadUserData: async (userId, token) => {
        console.log(`[Finance Store] Fetching database records from MySQL for User: ${userId}`);
        try {
          const overrideHeaders: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
          
          const [accountsRes, budgetsRes, transactionsRes, goalsRes] = await Promise.all([
            fetchWithAuth(`${backendUrl}/api/accounts`, { headers: overrideHeaders }),
            fetchWithAuth(`${backendUrl}/api/budgets`, { headers: overrideHeaders }),
            fetchWithAuth(`${backendUrl}/api/transactions`, { headers: overrideHeaders }),
            fetchWithAuth(`${backendUrl}/api/goals`, { headers: overrideHeaders }),
          ]);

          if (!accountsRes.ok || !budgetsRes.ok || !transactionsRes.ok || !goalsRes.ok) {
            throw new Error('Database server query failed.');
          }

          const serverAccounts = await accountsRes.json();
          const serverBudgets = await budgetsRes.json();
          const serverTransactions = await transactionsRes.json();
          const serverGoals = await goalsRes.json();

          // Load local cache to compare timestamps
          const localCache = get().userStorage[userId] || {
            accounts: [],
            budgets: [],
            transactions: [],
            goals: [],
            categories: defaultCategories
          };

          // Merge using Last-Write-Wins (LWW)
          const mergedAccounts = mergeRecords(localCache.accounts, serverAccounts);
          const mergedBudgets = mergeRecords(localCache.budgets, serverBudgets);
          const mergedTransactions = mergeRecords(localCache.transactions, serverTransactions);
          const mergedGoals = mergeRecords(localCache.goals || [], serverGoals);

          set({
            currentUserId: userId,
            accounts: mergedAccounts,
            budgets: mergedBudgets,
            transactions: mergedTransactions,
            goals: mergedGoals,
          });

          // Process any due recurring transactions
          try {
            const processRes = await fetchWithAuth(`${backendUrl}/api/recurring/process`, {
              method: 'POST',
              headers: overrideHeaders,
            });
            if (processRes.ok) {
              const processData = await processRes.json();
              if (processData.processed > 0) {
                console.log(`[Finance Store] Auto-processed ${processData.processed} recurring transactions.`);
                
                // Fetch latest transactions and accounts to show new recurring occurrences immediately
                const [refetchedTxns, refetchedAccs] = await Promise.all([
                  fetchWithAuth(`${backendUrl}/api/transactions`, { headers: overrideHeaders }),
                  fetchWithAuth(`${backendUrl}/api/accounts`, { headers: overrideHeaders }),
                ]);
                if (refetchedTxns.ok && refetchedAccs.ok) {
                  const txns = await refetchedTxns.json();
                  const accs = await refetchedAccs.json();
                  set({ transactions: txns, accounts: accs });
                }
              }
            }
          } catch (e) {
            console.warn('[Finance Store] Failed to process recurring transactions:', e);
          }

          // Load recurring rules
          try {
            const recurringRes = await fetchWithAuth(`${backendUrl}/api/recurring`, {
              headers: overrideHeaders,
            });
            if (recurringRes.ok) {
              const recurringRules = await recurringRes.json();
              set({ recurringRules });
            }
          } catch (e) {
            console.warn('[Finance Store] Failed to load recurring rules:', e);
          }

          // Sync any local updates that were newer back to the server
          await get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] Failed to load data from MySQL server. Falling back to local cache.', error);
          
          // Offline fallback
          set((state) => {
            const userData = state.userStorage[userId] || {
              accounts: defaultAccounts.map((acc) => ({ ...acc, id: `${acc.id}_${userId}`, balance: 0 })),
              categories: defaultCategories,
              transactions: [],
              budgets: [],
              goals: [],
            };
            return {
              currentUserId: userId,
              accounts: userData.accounts,
              categories: userData.categories,
              transactions: userData.transactions,
              budgets: userData.budgets,
              goals: userData.goals || [],
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
              goals: state.goals,
            };
          }
          return {
            currentUserId: null,
            userStorage,
            accounts: defaultAccounts.map((acc) => ({ ...acc, balance: 0 })),
            categories: defaultCategories,
            transactions: [],
            budgets: [],
            goals: [],
          };
        }),

      addRecurringRule: async (rule) => {
        const id = generateId('rec');
        const now = Date.now();
        const finalRule: RecurringRule = { ...rule, id, isActive: 1, updatedAt: now };

        set((state) => ({ recurringRules: [...state.recurringRules, finalRule] }));

        try {
          const response = await fetchWithAuth(`${backendUrl}/api/recurring`, {
            method: 'POST',
            body: JSON.stringify(finalRule),
          });
          if (!response.ok) throw new Error('Failed to save recurring rule.');
        } catch (error) {
          console.warn('[Finance Store] addRecurringRule failed:', error);
          set((state) => ({ recurringRules: state.recurringRules.filter((r) => r.id !== id) }));
        }
      },

      deleteRecurringRule: async (id) => {
        set((state) => ({ recurringRules: state.recurringRules.filter((r) => r.id !== id) }));

        try {
          const response = await fetchWithAuth(`${backendUrl}/api/recurring/${id}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('Failed to delete recurring rule.');
        } catch (error) {
          console.warn('[Finance Store] deleteRecurringRule failed:', error);
        }
      },

      addGoal: async (goal) => {
        const tempId = generateId('goal');
        const now = Date.now();
        const finalGoal: SavingsGoal = { ...goal, id: tempId, updatedAt: now };

        updateStateAndStorage(set, (state) => ({
          goals: [finalGoal, ...state.goals],
        }));

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_GOAL',
          payload: finalGoal,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing addGoal to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/goals`, {
            method: 'POST',
            body: JSON.stringify(finalGoal),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] addGoal API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      updateGoal: async (id, changes) => {
        let updatedGoal: SavingsGoal | undefined;
        const now = Date.now();

        updateStateAndStorage(set, (state) => {
          const existing = state.goals.find((g) => g.id === id);
          if (!existing) return {};
          updatedGoal = { ...existing, ...changes, updatedAt: now };
          return {
            goals: state.goals.map((g) => (g.id === id ? updatedGoal! : g)),
          };
        });

        if (!updatedGoal) return;

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'SAVE_GOAL',
          payload: updatedGoal,
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing updateGoal to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/goals`, {
            method: 'POST',
            body: JSON.stringify(updatedGoal),
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] updateGoal API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      deleteGoal: async (id) => {
        let originalGoal: SavingsGoal | undefined;

        updateStateAndStorage(set, (state) => {
          const existing = state.goals.find((g) => g.id === id);
          if (!existing) return {};
          originalGoal = existing;
          return {
            goals: state.goals.filter((g) => g.id !== id),
          };
        });

        if (!originalGoal) return;

        const syncAction: SyncAction = {
          id: generateId('sync'),
          action: 'DELETE_GOAL',
          payload: { id },
          timestamp: Date.now(),
          retryCount: 0,
        };

        try {
          console.log('[Finance Store] Syncing deleteGoal to MySQL...');
          const response = await fetchWithAuth(`${backendUrl}/api/goals/${id}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('API Sync Failed');
          get().triggerSync();
        } catch (error) {
          console.warn('[Finance Store] deleteGoal API Sync failed; stored in offline queue.', error);
          set((state) => ({ syncQueue: [...state.syncQueue, syncAction] }));
        }
      },

      triggerSync: async () => {
        const { syncQueue, isSyncing } = get();
        if (isSyncing || syncQueue.length === 0) return;

        set({ isSyncing: true });
        console.log(`[Finance Store] Starting background queue sync of ${syncQueue.length} items...`);

        const remainingQueue = [...syncQueue];

        while (remainingQueue.length > 0) {
          const actionItem = remainingQueue[0];
          try {
            let response: Response;

            if (actionItem.action === 'SAVE_TXN') {
              response = await fetchWithAuth(`${backendUrl}/api/transactions`, {
                method: 'POST',
                body: JSON.stringify(actionItem.payload),
              });
            } else if (actionItem.action === 'DELETE_TXN') {
              response = await fetchWithAuth(`${backendUrl}/api/transactions/${actionItem.payload.id}`, {
                method: 'DELETE',
              });
            } else if (actionItem.action === 'SAVE_ACC') {
              response = await fetchWithAuth(`${backendUrl}/api/accounts`, {
                method: 'POST',
                body: JSON.stringify(actionItem.payload),
              });
            } else if (actionItem.action === 'SAVE_BUDGET') {
              response = await fetchWithAuth(`${backendUrl}/api/budgets`, {
                method: 'POST',
                body: JSON.stringify(actionItem.payload),
              });
            } else if (actionItem.action === 'DELETE_BUDGET') {
              response = await fetchWithAuth(`${backendUrl}/api/budgets/${actionItem.payload.categoryId}`, {
                method: 'DELETE',
              });
            } else if (actionItem.action === 'SAVE_GOAL') {
              response = await fetchWithAuth(`${backendUrl}/api/goals`, {
                method: 'POST',
                body: JSON.stringify(actionItem.payload),
              });
            } else if (actionItem.action === 'DELETE_GOAL') {
              response = await fetchWithAuth(`${backendUrl}/api/goals/${actionItem.payload.id}`, {
                method: 'DELETE',
              });
            } else {
              throw new Error('Unknown sync action');
            }

            if (response.ok) {
              console.log(`[Finance Store] Successfully synced item: ${actionItem.action}`);
              remainingQueue.shift(); // remove from queue
              set({ syncQueue: [...remainingQueue] });
            } else {
              console.warn(`[Finance Store] Sync failed for item: ${actionItem.action}. Server returned status ${response.status}.`);
              const retries = (actionItem.retryCount || 0) + 1;
              if (retries >= 3) {
                console.error(`[Finance Store] Max sync retries exceeded (3) for item: ${actionItem.action}. Sending to dead letter queue.`);
                remainingQueue.shift();
                set((state) => ({
                  syncQueue: [...remainingQueue],
                  deadLetterQueue: [...(state.deadLetterQueue || []), { ...actionItem, retryCount: retries }]
                }));
              } else {
                remainingQueue[0] = { ...actionItem, retryCount: retries };
                set({ syncQueue: [...remainingQueue] });
                break; // Stop sync loop to retry later
              }
            }
          } catch (err) {
            console.warn(`[Finance Store] Sync network error for item: ${actionItem.action}.`, err);
            const retries = (actionItem.retryCount || 0) + 1;
            if (retries >= 3) {
              console.error(`[Finance Store] Max sync retries exceeded (3) for item: ${actionItem.action} due to network error. Sending to dead letter queue.`);
              remainingQueue.shift();
              set((state) => ({
                syncQueue: [...remainingQueue],
                deadLetterQueue: [...(state.deadLetterQueue || []), { ...actionItem, retryCount: retries }]
              }));
            } else {
              remainingQueue[0] = { ...actionItem, retryCount: retries };
              set({ syncQueue: [...remainingQueue] });
              break; // Stop sync loop to retry later
            }
          }
        }

        set({ isSyncing: false });
      },
    }),
    {
      name: 'coinzy-finance-v5',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
