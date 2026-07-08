import { Account, Category } from '../types';
import { colors } from '../theme';

export const defaultCategories: Category[] = [
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

export const defaultAccounts: Account[] = [
  { id: 'acc_checking', name: 'Everyday Checking', type: 'checking', balance: 0.00, currency: 'INR', color: colors.primary, icon: 'card-outline' },
  { id: 'acc_savings', name: 'Savings', type: 'savings', balance: 0.00, currency: 'INR', color: colors.income, icon: 'wallet-outline' },
  { id: 'acc_credit', name: 'Visa Credit Card', type: 'credit', balance: 0.00, currency: 'INR', color: colors.expense, icon: 'card' },
  { id: 'acc_cash', name: 'Cash', type: 'cash', balance: 0.00, currency: 'INR', color: colors.amber, icon: 'cash-outline' },
];
