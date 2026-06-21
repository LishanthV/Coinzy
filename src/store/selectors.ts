import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFinanceStore } from './useFinanceStore';

export function useTotalBalance() {
  return useFinanceStore((s) =>
    s.accounts.reduce((sum, a) => sum + a.balance, 0)
  );
}

export function useNetForMonth(ref?: Date) {
  const finalRef = useMemo(() => ref ?? new Date(), [ref]);
  const month = finalRef.getMonth();
  const year = finalRef.getFullYear();

  const selector = useCallback(
    (s: any) => {
      let income = 0;
      let expense = 0;
      for (const t of s.transactions) {
        const d = new Date(t.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          if (t.type === 'income') income += t.amount;
          if (t.type === 'expense') expense += t.amount;
        }
      }
      return { income, expense };
    },
    [month, year]
  );

  return useFinanceStore(useShallow(selector));
}

export function useSpendByCategory(ref?: Date) {
  const finalRef = useMemo(() => ref ?? new Date(), [ref]);
  const month = finalRef.getMonth();
  const year = finalRef.getFullYear();

  const selector = useCallback(
    (s: any) => {
      const result: Record<string, number> = {};
      for (const t of s.transactions) {
        if (t.type !== 'expense') continue;
        const d = new Date(t.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          if (!t.categoryId) continue;
          result[t.categoryId] = (result[t.categoryId] ?? 0) + t.amount;
        }
      }
      return result;
    },
    [month, year]
  );

  return useFinanceStore(useShallow(selector));
}

