import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormInput } from '../../components/ui';
import { CategoryIcon } from '../../components/finance';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { formatCurrency, formatDateLong } from '../../utils/format';
import { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TxnDetail'>;
type Route = RouteProp<RootStackParamList, 'TxnDetail'>;

export default function TxnDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const accounts = useFinanceStore((s) => s.accounts);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'USD';

  const txn = transactions.find((t) => t.id === params.id);

  const [note, setNote] = useState(txn?.note ?? '');
  const [categoryId, setCategoryId] = useState(txn?.categoryId);
  const [editing, setEditing] = useState(false);

  if (!txn) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Transaction not found</Text>
          <Button label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  const account = accounts.find((a) => a.id === txn.accountId);
  const toAccount = txn.toAccountId ? accounts.find((a) => a.id === txn.toAccountId) : undefined;
  const category = txn.categoryId ? categories.find((c) => c.id === txn.categoryId) : undefined;
  const availableCategories = categories.filter((c) => c.type === txn.type);

  const isExpense = txn.type === 'expense';
  const isTransfer = txn.type === 'transfer';
  const amountColor = isTransfer ? colors.transfer : isExpense ? colors.expense : colors.income;
  const sign = isTransfer ? '' : isExpense ? '-' : '+';

  const onSave = () => {
    updateTransaction(txn.id, { note, categoryId: isTransfer ? undefined : categoryId });
    setEditing(false);
  };

  const onDelete = () => {
    Alert.alert('Delete transaction', 'This will also reverse its effect on your account balance.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(txn.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction</Text>
        <Pressable onPress={() => (editing ? onSave() : setEditing(true))} hitSlop={12}>
          <Text style={styles.headerAction}>{editing ? 'Save' : 'Edit'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.amountBlock}>
          {!isTransfer && (
            <CategoryIcon icon={category?.icon ?? 'ellipse-outline'} color={category?.color ?? colors.textMuted} size={56} />
          )}
          {isTransfer && <CategoryIcon icon="swap-horizontal" color={colors.transfer} size={56} />}
          <Text style={[styles.amount, { color: amountColor }]}>
            {sign}
            {formatCurrency(txn.amount, currency)}
          </Text>
          <Text style={styles.date}>{formatDateLong(txn.date)}</Text>
        </View>

        <FormInput
          label="Note"
          value={note}
          onChangeText={setNote}
          editable={editing}
          placeholder="Add a note"
        />

        {txn.items && txn.items.length > 0 && (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={styles.label}>Receipt Items</Text>
            <View style={styles.itemsCard}>
              {txn.merchant && (
                <View style={styles.merchantHeader}>
                  <Ionicons name="storefront-outline" size={16} color={colors.primary} />
                  <Text style={styles.merchantName}>{txn.merchant}</Text>
                </View>
              )}
              {txn.merchant && <View style={styles.itemDivider} />}
              {txn.items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>• {item.name}</Text>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(item.price, currency)}
                  </Text>
                </View>
              ))}
              <View style={styles.itemDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Items Total:</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(txn.items.reduce((sum, i) => sum + i.price, 0), currency)}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ marginBottom: spacing.lg }}>
          <Text style={styles.label}>Account</Text>
          <View style={styles.readonlyRow}>
            <CategoryIcon icon={account?.icon ?? 'wallet-outline'} color={account?.color ?? colors.textMuted} size={32} />
            <Text style={styles.readonlyText}>{account?.name ?? 'Unknown account'}</Text>
          </View>
        </View>

        {isTransfer ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={styles.label}>To account</Text>
            <View style={styles.readonlyRow}>
              <CategoryIcon icon={toAccount?.icon ?? 'wallet-outline'} color={toAccount?.color ?? colors.textMuted} size={32} />
              <Text style={styles.readonlyText}>{toAccount?.name ?? 'Unknown account'}</Text>
            </View>
          </View>
        ) : (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={styles.label}>Category</Text>
            {editing ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryRow}>
                  {availableCategories.map((c) => {
                    const active = c.id === categoryId;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setCategoryId(c.id)}
                        style={[styles.categoryChip, active && { borderColor: c.color, backgroundColor: `${c.color}22` }]}
                      >
                        <CategoryIcon icon={c.icon} color={c.color} size={28} />
                        <Text style={styles.categoryChipText}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.readonlyRow}>
                <CategoryIcon icon={category?.icon ?? 'ellipse-outline'} color={category?.color ?? colors.textMuted} size={32} />
                <Text style={styles.readonlyText}>{category?.name ?? 'Uncategorized'}</Text>
              </View>
            )}
          </View>
        )}

        <Button label="Delete transaction" variant="danger" onPress={onDelete} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg },
  headerAction: { color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  amountBlock: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  amount: { fontFamily: fonts.displayBold, fontSize: fontSizes.display, marginTop: spacing.sm },
  date: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm },
  title: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg },
  label: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginBottom: spacing.xs },
  readonlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  readonlyText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  categoryRow: { flexDirection: 'row', gap: spacing.sm },
  categoryChip: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: 84,
  },
  categoryChipText: { color: colors.text, fontFamily: fonts.body, fontSize: fontSizes.xs, textAlign: 'center' },
  itemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  merchantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  merchantName: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
  },
  itemDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  itemName: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  itemPrice: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  totalValue: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
  },
});
