import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, SectionHeader, Card, Button, FormInput, EmptyState } from '../../components/ui';
import { CategoryIcon, ProgressBar } from '../../components/finance';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSpendByCategory } from '../../store/selectors';
import { formatCurrency } from '../../utils/format';
import { Category } from '../../types';

export default function BudgetsScreen() {
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const spendByCategory = useSpendByCategory();
  const setBudget = useFinanceStore((s) => s.setBudget);
  const removeBudget = useFinanceStore((s) => s.removeBudget);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'USD';

  const [editing, setEditing] = useState<Category | null>(null);
  const [limitInput, setLimitInput] = useState('');

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const budgetByCategory = Object.fromEntries(budgets.map((b) => [b.categoryId, b]));

  const budgeted = useMemo(
    () => expenseCategories.filter((c) => budgetByCategory[c.id]),
    [expenseCategories, budgetByCategory]
  );
  const unbudgeted = useMemo(
    () => expenseCategories.filter((c) => !budgetByCategory[c.id]),
    [expenseCategories, budgetByCategory]
  );

  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgeted.reduce((s, c) => s + (spendByCategory[c.id] ?? 0), 0);

  const openEditor = (category: Category) => {
    setEditing(category);
    setLimitInput(budgetByCategory[category.id]?.limit?.toString() ?? '');
  };

  const onSave = () => {
    const value = parseFloat(limitInput);
    if (editing && !isNaN(value) && value > 0) {
      setBudget(editing.id, value);
    }
    setEditing(null);
  };

  const onRemove = () => {
    if (editing) removeBudget(editing.id);
    setEditing(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Screen contentStyle={{ paddingTop: spacing.sm }}>
        <Text style={styles.title}>Budgets</Text>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.overviewLabel}>Total monthly budget</Text>
          <Text style={styles.overviewValue}>{formatCurrency(totalLimit, currency)}</Text>
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              progress={totalLimit > 0 ? totalSpent / totalLimit : 0}
              color={totalSpent > totalLimit ? colors.expense : colors.primary}
              height={10}
            />
          </View>
          <Text style={styles.overviewSubtitle}>
            {formatCurrency(totalSpent, currency)} spent of {formatCurrency(totalLimit, currency)}
          </Text>
        </Card>

        <SectionHeader title="Category limits" />
        {budgeted.length === 0 ? (
          <Card>
            <EmptyState title="No budgets set" subtitle="Set a monthly limit for a category below to track it here." />
          </Card>
        ) : (
          <Card style={{ gap: 0 }}>
            {budgeted.map((cat, idx) => {
              const limit = budgetByCategory[cat.id]?.limit ?? 0;
              const spent = spendByCategory[cat.id] ?? 0;
              const ratio = limit > 0 ? spent / limit : 0;
              const overBudget = spent > limit;
              return (
                <Pressable key={cat.id} onPress={() => openEditor(cat)} style={styles.budgetRow}>
                  <View style={styles.budgetHeader}>
                    <CategoryIcon icon={cat.icon} color={cat.color} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.budgetName}>{cat.name}</Text>
                      <Text style={[styles.budgetAmounts, overBudget && { color: colors.expense }]}>
                        {formatCurrency(spent, currency)} of {formatCurrency(limit, currency)}
                      </Text>
                    </View>
                    {overBudget && <Text style={styles.overTag}>Over</Text>}
                  </View>
                  <ProgressBar
                    progress={ratio}
                    color={overBudget ? colors.expense : cat.color}
                    height={6}
                  />
                  {idx < budgeted.length - 1 && <View style={styles.divider} />}
                </Pressable>
              );
            })}
          </Card>
        )}

        {unbudgeted.length > 0 && (
          <>
            <SectionHeader title="Set a budget" />
            <Card style={{ gap: spacing.sm }}>
              {unbudgeted.map((cat) => (
                <Pressable key={cat.id} onPress={() => openEditor(cat)} style={styles.unbudgetedRow}>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={36} />
                  <Text style={styles.budgetName}>{cat.name}</Text>
                  <Text style={styles.addLabel}>Add limit</Text>
                </Pressable>
              ))}
            </Card>
          </>
        )}
      </Screen>

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {editing && (
              <>
                <View style={styles.modalHeader}>
                  <CategoryIcon icon={editing.icon} color={editing.color} size={40} />
                  <Text style={styles.modalTitle}>{editing.name} budget</Text>
                </View>
                <FormInput
                  label={`Monthly limit (${currency})`}
                  value={limitInput}
                  onChangeText={setLimitInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  autoFocus
                />
                <Button label="Save budget" onPress={onSave} />
                {budgetByCategory[editing.id] && (
                  <Button label="Remove budget" variant="danger" onPress={onRemove} style={{ marginTop: spacing.sm }} />
                )}
                <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ marginTop: spacing.sm }} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl },
  overviewLabel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  overviewValue: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl, marginTop: 2 },
  overviewSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, marginTop: spacing.sm },
  budgetRow: { paddingVertical: spacing.md },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  budgetName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, flex: 1 },
  budgetAmounts: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, marginTop: 2 },
  overTag: {
    color: colors.expense,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    backgroundColor: colors.expenseSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginTop: spacing.md },
  unbudgetedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  addLabel: { color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  modalTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.lg },
});
