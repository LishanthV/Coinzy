import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category, Transaction } from '../types';
import { colors, fonts, fontSizes, radii, spacing } from '../theme';
import { dayLabel, formatCurrency } from '../utils/format';

// ── Category icon bubble ─────────────────────────────────────────────
export function CategoryIcon({
  icon,
  color,
  size = 40,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBubble,
        { width: size, height: size, borderRadius: size / 2.6, backgroundColor: `${color}26` },
      ]}
    >
      <Ionicons name={icon as any} size={size * 0.5} color={color} />
    </View>
  );
}

// ── Transaction row ───────────────────────────────────────────────────
export function TransactionRow({
  transaction,
  category,
  accountName,
  currency,
  onPress,
}: {
  transaction: Transaction;
  category?: Category;
  accountName?: string;
  currency: string;
  onPress?: () => void;
}) {
  const isExpense = transaction.type === 'expense';
  const isTransfer = transaction.type === 'transfer';
  const amountColor = isTransfer ? colors.transfer : isExpense ? colors.text : colors.income;
  const sign = isTransfer ? '' : isExpense ? '-' : '+';
  const icon = isTransfer ? 'swap-horizontal' : category?.icon ?? 'ellipse-outline';
  const color = isTransfer ? colors.transfer : category?.color ?? colors.textMuted;
  const title = isTransfer ? 'Transfer' : category?.name ?? 'Uncategorized';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.7 }]}
    >
      <CategoryIcon icon={icon} color={color} />
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{transaction.note || title}</Text>
        <Text style={styles.rowSubtitle}>
          {title}
          {accountName ? ` · ${accountName}` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: amountColor }]}>
          {sign}
          {formatCurrency(transaction.amount, currency)}
        </Text>
        <Text style={styles.rowDate}>{dayLabel(transaction.date)}</Text>
      </View>
    </Pressable>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────
export function ProgressBar({
  progress,
  color,
  trackColor = colors.surfaceAlt,
  height = 8,
}: {
  progress: number; // 0..1+
  color: string;
  trackColor?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(progress, 1));
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: color,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBubble: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowMid: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  rowSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowAmount: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  rowDate: { color: colors.textFaint, fontFamily: fonts.body, fontSize: fontSizes.xs },
  track: { width: '100%', overflow: 'hidden' },
  fill: {},
});
