import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAppTheme } from '../theme';
import { useFinanceStore } from '../store/useFinanceStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  generateSpendingForecast,
  formatForecastAmount,
  getForecastStatusColor,
  getForecastStatusLabel,
  CategoryForecast,
} from '../utils/spendingForecast';

// ─── Mini progress bar ────────────────────────────────────────────────────────

function ForecastBar({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const { colors } = useAppTheme();
  const clamped = Math.min(percent, 100);
  return (
    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
      <View
        style={[
          styles.barFill,
          { width: `${clamped}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({ item }: { item: CategoryForecast }) {
  const { colors } = useAppTheme();
  const statusColor = getForecastStatusColor(item.status);
  const statusLabel = getForecastStatusLabel(item.status);
  const percent = item.percentOfBudget ?? 0;

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryHeader}>
        <Text style={[styles.categoryName, { color: colors.text }]}>{item.category}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.categoryAmounts}>
        <Text style={[styles.spentText, { color: colors.text }]}>
          Spent: {formatForecastAmount(item.spentSoFar)}
        </Text>
        <Text style={[styles.projectedText, { color: colors.text }]}>
          Projected: {formatForecastAmount(item.projectedTotal)}
        </Text>
        {item.budgetLimit !== null && (
          <Text style={[styles.budgetText, { color: colors.textMuted }]}>
            Budget: {formatForecastAmount(item.budgetLimit)}
          </Text>
        )}
      </View>

      {item.budgetLimit !== null && (
        <ForecastBar percent={percent} color={statusColor} />
      )}

      <Text style={[styles.dailyAvg, { color: colors.textMuted }]}>
        Daily avg: {formatForecastAmount(item.dailyAverage)} ·{' '}
        {item.daysRemaining} days left
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SpendingForecastScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { transactions, budgets } = useFinanceStore();
  const { user } = useAuthStore();

  const forecast = useMemo(
    () =>
      generateSpendingForecast(
        transactions,
        budgets,
        user?.monthlyIncomeTarget ?? undefined
      ),
    [transactions, budgets, user]
  );

  const summaryColor =
    forecast.overBudgetCategories.length > 0
      ? '#EF4444'
      : forecast.warningCategories.length > 0
      ? '#F59E0B'
      : '#10B981';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <Text style={[styles.title, { color: colors.text }]}>
        Spending Forecast
      </Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Based on your pace so far this month ({forecast.daysElapsed} of{' '}
        {forecast.daysInMonth} days)
      </Text>

      {/* Summary card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Spent So Far
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatForecastAmount(forecast.totalSpentSoFar)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Projected Total
            </Text>
            <Text style={[styles.summaryValue, { color: summaryColor }]}>
              {formatForecastAmount(forecast.projectedMonthTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Daily Average
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatForecastAmount(forecast.dailyAverageSpend)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              {forecast.projectedSavings !== null
                ? forecast.projectedSavings >= 0
                  ? 'Projected Savings'
                  : 'Projected Deficit'
                : 'Days Remaining'}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                {
                  color:
                    forecast.projectedSavings !== null
                      ? forecast.projectedSavings >= 0
                        ? '#10B981'
                        : '#EF4444'
                      : colors.text,
                },
              ]}
            >
              {forecast.projectedSavings !== null
                ? formatForecastAmount(Math.abs(forecast.projectedSavings))
                : `${forecast.daysRemaining} days`}
            </Text>
          </View>
        </View>

        {/* Alert banners */}
        {forecast.overBudgetCategories.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              🚨 {forecast.overBudgetCategories.length} categor
              {forecast.overBudgetCategories.length === 1 ? 'y' : 'ies'} projected
              to exceed budget
            </Text>
          </View>
        )}
        {forecast.warningCategories.length > 0 && (
          <View style={[styles.alertBanner, { backgroundColor: '#F59E0B22' }]}>
            <Text style={[styles.alertText, { color: '#F59E0B' }]}>
              ⚠️ {forecast.warningCategories.length} categor
              {forecast.warningCategories.length === 1 ? 'y' : 'ies'} approaching
              limit
            </Text>
          </View>
        )}
      </View>

      {/* Category breakdown */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Category Breakdown
      </Text>

      {forecast.categories.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No expenses recorded this month yet.
          </Text>
        </View>
      ) : (
        forecast.categories.map((item) => (
          <View
            key={item.category}
            style={[styles.categoryCard, { backgroundColor: colors.surface }]}
          >
            <CategoryRow item={item} />
          </View>
        ))
      )}

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        Forecast updated · {new Date(forecast.generatedAt).toLocaleTimeString()}
      </Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 20 },

  summaryCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  summaryLabel: { fontSize: 11, marginBottom: 4, textTransform: 'uppercase' },
  summaryValue: { fontSize: 20, fontWeight: '700' },

  alertBanner: {
    backgroundColor: '#EF444422',
    borderRadius: 8,
    padding: 10,
  },
  alertText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },

  categoryCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  categoryRow: { gap: 8 },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: { fontSize: 15, fontWeight: '600' },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusLabel: { fontSize: 11, fontWeight: '600' },

  categoryAmounts: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  spentText: { fontSize: 12 },
  projectedText: { fontSize: 12, fontWeight: '600' },
  budgetText: { fontSize: 12 },

  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },

  dailyAvg: { fontSize: 11 },

  emptyCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14 },

  footer: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
