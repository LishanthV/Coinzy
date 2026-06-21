import { Account, Budget, Category, Transaction } from '../types';
import { colors } from '../theme';

export const seedCategories: Category[] = [
  { id: 'cat_groceries', name: 'Groceries', icon: 'cart-outline', color: colors.income, type: 'expense' },
  { id: 'cat_dining', name: 'Dining out', icon: 'restaurant-outline', color: colors.amber, type: 'expense' },
  { id: 'cat_transport', name: 'Transport', icon: 'car-outline', color: colors.transfer, type: 'expense' },
  { id: 'cat_housing', name: 'Housing', icon: 'home-outline', color: colors.primary, type: 'expense' },
  { id: 'cat_utilities', name: 'Utilities', icon: 'flash-outline', color: colors.amber, type: 'expense' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'bag-handle-outline', color: colors.magenta, type: 'expense' },
  { id: 'cat_health', name: 'Health', icon: 'medkit-outline', color: colors.expense, type: 'expense' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'film-outline', color: colors.magenta, type: 'expense' },
  { id: 'cat_other_exp', name: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: colors.textMuted, type: 'expense' },
  { id: 'cat_salary', name: 'Salary', icon: 'cash-outline', color: colors.income, type: 'income' },
  { id: 'cat_freelance', name: 'Freelance', icon: 'laptop-outline', color: colors.transfer, type: 'income' },
  { id: 'cat_other_inc', name: 'Other income', icon: 'gift-outline', color: colors.green, type: 'income' },
];

export const seedAccounts: Account[] = [
  { id: 'acc_checking', name: 'Everyday Checking', type: 'checking', balance: 3240.55, currency: 'USD', color: colors.primary, icon: 'card-outline' },
  { id: 'acc_savings', name: 'Savings', type: 'savings', balance: 12850.0, currency: 'USD', color: colors.income, icon: 'wallet-outline' },
  { id: 'acc_credit', name: 'Visa Credit Card', type: 'credit', balance: -482.3, currency: 'USD', color: colors.expense, icon: 'card' },
  { id: 'acc_cash', name: 'Cash', type: 'cash', balance: 120.0, currency: 'USD', color: colors.amber, icon: 'cash-outline' },
];

const today = new Date();
function daysAgo(n: number, hour = 12): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const seedTransactions: Transaction[] = [
  { id: 'txn_1', type: 'income', amount: 4200, accountId: 'acc_checking', categoryId: 'cat_salary', note: 'Monthly salary', date: daysAgo(2, 9) },
  { id: 'txn_2', type: 'expense', amount: 86.42, accountId: 'acc_checking', categoryId: 'cat_groceries', note: 'Whole Foods', date: daysAgo(0, 18) },
  { id: 'txn_3', type: 'expense', amount: 14.5, accountId: 'acc_credit', categoryId: 'cat_dining', note: 'Coffee & bagel', date: daysAgo(0, 9) },
  { id: 'txn_4', type: 'expense', amount: 1450, accountId: 'acc_checking', categoryId: 'cat_housing', note: 'Rent', date: daysAgo(3, 8) },
  { id: 'txn_5', type: 'expense', amount: 42.0, accountId: 'acc_credit', categoryId: 'cat_transport', note: 'Gas station', date: daysAgo(1, 17) },
  { id: 'txn_6', type: 'expense', amount: 65.3, accountId: 'acc_checking', categoryId: 'cat_utilities', note: 'Electric bill', date: daysAgo(4, 11) },
  { id: 'txn_7', type: 'expense', amount: 120.0, accountId: 'acc_credit', categoryId: 'cat_shopping', note: 'New shoes', date: daysAgo(5, 15) },
  { id: 'txn_8', type: 'income', amount: 650, accountId: 'acc_checking', categoryId: 'cat_freelance', note: 'Logo design gig', date: daysAgo(6, 10) },
  { id: 'txn_9', type: 'expense', amount: 28.9, accountId: 'acc_credit', categoryId: 'cat_entertainment', note: 'Movie tickets', date: daysAgo(7, 20) },
  { id: 'txn_10', type: 'expense', amount: 54.2, accountId: 'acc_checking', categoryId: 'cat_groceries', note: 'Trader Joes', date: daysAgo(8, 18) },
  { id: 'txn_11', type: 'expense', amount: 22.0, accountId: 'acc_cash', categoryId: 'cat_dining', note: 'Lunch with team', date: daysAgo(9, 13) },
  { id: 'txn_12', type: 'transfer', amount: 500, accountId: 'acc_checking', toAccountId: 'acc_savings', note: 'Move to savings', date: daysAgo(10, 9) },
  { id: 'txn_13', type: 'expense', amount: 18.75, accountId: 'acc_credit', categoryId: 'cat_health', note: 'Pharmacy', date: daysAgo(12, 16) },
  { id: 'txn_14', type: 'expense', amount: 39.99, accountId: 'acc_checking', categoryId: 'cat_entertainment', note: 'Streaming subscriptions', date: daysAgo(13, 8) },
  { id: 'txn_15', type: 'expense', amount: 76.4, accountId: 'acc_checking', categoryId: 'cat_groceries', note: 'Farmers market', date: daysAgo(15, 11) },
];

export const seedBudgets: Budget[] = [
  { id: 'bud_groceries', categoryId: 'cat_groceries', limit: 400, period: 'monthly' },
  { id: 'bud_dining', categoryId: 'cat_dining', limit: 150, period: 'monthly' },
  { id: 'bud_transport', categoryId: 'cat_transport', limit: 120, period: 'monthly' },
  { id: 'bud_shopping', categoryId: 'cat_shopping', limit: 200, period: 'monthly' },
  { id: 'bud_entertainment', categoryId: 'cat_entertainment', limit: 80, period: 'monthly' },
];
