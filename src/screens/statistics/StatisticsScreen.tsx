import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, SectionHeader, EmptyState, Card } from '../../components/ui';
import { DonutChart, BarChart } from '../../components/charts';
import { CategoryIcon } from '../../components/finance';
import { colors, fonts, fontSizes, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSpendByCategory } from '../../store/selectors';
import { formatCurrency } from '../../utils/format';

export default function StatisticsScreen() {
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const spendByCategory = useSpendByCategory();
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'USD';

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const breakdown = useMemo(() => {
    return Object.entries(spendByCategory)
      .map(([categoryId, value]) => ({ categoryId, value, category: categoryById[categoryId] }))
      .filter((b) => b.category)
      .sort((a, b) => b.value - a.value);
  }, [spendByCategory, categories]);

  const totalSpend = breakdown.reduce((s, b) => s + b.value, 0);

  // Last 6 months net flow (income - expense)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = ref.toLocaleDateString(undefined, { month: 'short' });
      let income = 0;
      let expense = 0;
      for (const t of transactions) {
        const d = new Date(t.date);
        if (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()) {
          if (t.type === 'income') income += t.amount;
          if (t.type === 'expense') expense += t.amount;
        }
      }
      months.push({ label, income, expense });
    }
    return months;
  }, [transactions]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Screen contentStyle={{ paddingTop: spacing.sm }}>
        <Text style={styles.title}>Statistics</Text>

        <SectionHeader title="Spending by category" />
        {breakdown.length === 0 ? (
          <Card>
            <EmptyState title="No expenses this month" subtitle="Your category breakdown will appear here." />
          </Card>
        ) : (
          <Card>
            <View style={styles.donutRow}>
              <DonutChart data={breakdown.map((b) => ({ value: b.value, color: b.category!.color }))} />
              <View style={styles.donutCenter}>
                <Text style={styles.donutTotalLabel}>Total spent</Text>
                <Text style={styles.donutTotal}>{formatCurrency(totalSpend, currency)}</Text>
              </View>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              {breakdown.map((b) => (
                <View key={b.categoryId} style={styles.legendRow}>
                  <CategoryIcon icon={b.category!.icon} color={b.category!.color} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendName}>{b.category!.name}</Text>
                    <Text style={styles.legendPercent}>
                      {totalSpend > 0 ? Math.round((b.value / totalSpend) * 100) : 0}% of spending
                    </Text>
                  </View>
                  <Text style={styles.legendValue}>{formatCurrency(b.value, currency)}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <SectionHeader title="Income vs. expenses" />
        <Card>
          <View style={styles.legendKeyRow}>
            <View style={styles.legendKey}>
              <View style={[styles.dot, { backgroundColor: colors.income }]} />
              <Text style={styles.legendKeyText}>Income</Text>
            </View>
            <View style={styles.legendKey}>
              <View style={[styles.dot, { backgroundColor: colors.expense }]} />
              <Text style={styles.legendKeyText}>Expenses</Text>
            </View>
          </View>
          <View style={styles.trendBars}>
            {monthlyTrend.map((m, i) => {
              const max = Math.max(...monthlyTrend.map((x) => Math.max(x.income, x.expense)), 1);
              const incomeH = Math.max((m.income / max) * 120, 3);
              const expenseH = Math.max((m.expense / max) * 120, 3);
              return (
                <View key={i} style={styles.trendCol}>
                  <View style={styles.trendBarGroup}>
                    <View style={[styles.trendBar, { height: incomeH, backgroundColor: colors.income }]} />
                    <View style={[styles.trendBar, { height: expenseH, backgroundColor: colors.expense }]} />
                  </View>
                  <Text style={styles.trendLabel}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl, marginBottom: spacing.sm },
  donutRow: { alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutTotalLabel: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs },
  donutTotal: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.lg, marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  legendName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  legendPercent: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, marginTop: 2 },
  legendValue: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  legendKeyRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.lg },
  legendKey: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendKeyText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  trendBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 150 },
  trendCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  trendBarGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  trendBar: { width: 10, borderRadius: 4 },
  trendLabel: { color: colors.textFaint, fontFamily: fonts.body, fontSize: fontSizes.xs },
});
