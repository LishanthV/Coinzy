import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alerts';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, SectionHeader, Card, Button } from '../../components/ui';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { formatCurrency, formatDate } from '../../utils/format';
import { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Export'>;

const RANGES = [
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

export default function ExportScreen() {
  const navigation = useNavigation<Nav>();
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const accounts = useFinanceStore((s) => s.accounts);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'INR';

  const [range, setRange] = useState('30');
  const [exporting, setExporting] = useState(false);

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const filtered = useMemo(() => {
    if (range === 'all') return transactions;
    const days = parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return transactions.filter((t) => new Date(t.date) >= cutoff);
  }, [transactions, range]);

  const sorted = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const buildCsv = () => {
    const header = ['Date', 'Type', 'Category', 'Account', 'Note', `Amount (${currency})`];
    const rows = sorted.map((t) => [
      new Date(t.date).toISOString().slice(0, 10),
      t.type,
      t.categoryId ? categoryById[t.categoryId]?.name ?? '' : 'Transfer',
      accountById[t.accountId]?.name ?? '',
      (t.note || '').replace(/,/g, ';'),
      (t.type === 'expense' ? -t.amount : t.amount).toFixed(2),
    ]);
    return [header, ...rows].map((r) => r.join(',')).join('\n');
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const csv = buildCsv();
      const fileUri = `${FileSystem.cacheDirectory}coinzy-export-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
      } else {
        Alert.alert('Export ready', `Saved to: ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', 'Something went wrong while preparing your file.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Export data</Text>
        <View style={{ width: 26 }} />
      </View>

      <Screen contentStyle={{ paddingTop: spacing.sm }}>
        <Text style={styles.subtitle}>
          Export your transactions as a CSV file you can open in Excel, Sheets, or Numbers — or share
          straight to your accountant.
        </Text>

        <SectionHeader title="Date range" />
        <Card style={{ gap: spacing.sm }}>
          {RANGES.map((r) => {
            const active = range === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRange(r.id)}
                style={[styles.rangeRow, active && styles.rangeRowActive]}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{r.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </Card>

        <SectionHeader title={`Preview (${sorted.length} transactions)`} />
        <Card style={{ gap: 0 }}>
          {sorted.slice(0, 6).map((t, idx) => (
            <View key={t.id}>
              <View style={styles.previewRow}>
                <Text style={styles.previewDate}>{formatDate(t.date)}</Text>
                <Text style={styles.previewNote} numberOfLines={1}>
                  {t.note || categoryById[t.categoryId ?? '']?.name || 'Transfer'}
                </Text>
                <Text style={[styles.previewAmount, t.type === 'expense' && { color: colors.expense }]}>
                  {t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}
                  {formatCurrency(t.amount, currency)}
                </Text>
              </View>
              {idx < Math.min(sorted.length, 6) - 1 && <View style={styles.divider} />}
            </View>
          ))}
          {sorted.length > 6 && (
            <Text style={styles.moreText}>+ {sorted.length - 6} more rows in the file</Text>
          )}
          {sorted.length === 0 && (
            <Text style={styles.moreText}>No transactions in this range.</Text>
          )}
        </Card>

        <Button
          label="Export & share CSV"
          onPress={onExport}
          loading={exporting}
          disabled={sorted.length === 0}
          style={{ marginTop: spacing.xl }}
        />
        <Text style={styles.footnote}>
          Opens your share sheet — save to Files, email to yourself, or open in Google Sheets directly.
        </Text>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg },
  subtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 20, marginBottom: spacing.sm },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rangeRowActive: { backgroundColor: colors.primarySoft },
  rangeText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  rangeTextActive: { color: colors.primary },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  previewDate: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, width: 50 },
  previewNote: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  previewAmount: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  moreText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: fontSizes.xs, paddingVertical: spacing.sm, textAlign: 'center' },
  footnote: { color: colors.textFaint, fontFamily: fonts.body, fontSize: fontSizes.xs, textAlign: 'center', marginTop: spacing.md },
});