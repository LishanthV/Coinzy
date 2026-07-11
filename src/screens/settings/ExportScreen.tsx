import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert as RNAlert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  const [range, setRange] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState('csv');

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

  const getNextFileName = async (ext: string) => {
    try {
      const stored = await AsyncStorage.getItem('coinzy_export_count');
      const currentCount = stored ? parseInt(stored, 10) : 0;
      await AsyncStorage.setItem('coinzy_export_count', (currentCount + 1).toString());
      
      const baseName = 'coinzy_statement';
      if (currentCount === 0) {
        return `${baseName}.${ext}`;
      } else {
        return `${baseName}_${currentCount}.${ext}`;
      }
    } catch {
      return `coinzy_statement.${ext}`;
    }
  };

  const onExport = async () => {
    RNAlert.alert('Debug', 'Export button pressed. Transactions: ' + sorted.length);
    if (sorted.length === 0) {
      RNAlert.alert('No transactions', 'No transactions found in the selected date range.');
      return;
    }
    const fileName = await getNextFileName('csv');
    if (Platform.OS === 'web') {
      try {
        const csv = buildCsv();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e: any) {
        console.error('Web export failed', e);
      }
      return;
    }
    setExporting(true);
    try {
      const csv = buildCsv();
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
      } else {
        RNAlert.alert('Export ready', `File saved to: ${fileUri}`);
      }
    } catch (e: any) {
      RNAlert.alert('Export failed', e?.message || 'Something went wrong while preparing your file.');
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    if (sorted.length === 0) {
      RNAlert.alert('No transactions', 'No transactions found in the selected date range.');
      return;
    }
    const fileName = await getNextFileName('pdf');
    const docTitle = fileName.replace('.pdf', '');
    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const html = `
          <html>
            <head>
              <title>${docTitle}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1f2937; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; color: #6366f1; }
                .meta { font-size: 14px; color: #6b7280; text-align: right; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
                td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
                .income { color: #10b981; font-weight: 600; }
                .expense { color: #ef4444; font-weight: 600; }
                .transfer { color: #6b7280; font-weight: 600; }
                .total { font-size: 16px; font-weight: bold; margin-top: 30px; text-align: right; }
              </style>
            </head>
            <body>
              <div class="header">
                <div>
                  <div class="title">Coinzy Report</div>
                  <div style="font-size: 14px; color: #4b5563; margin-top: 4px;">User: ${user?.name || user?.email || 'Valued Member'}</div>
                </div>
                <div class="meta">
                  <div>Date Range: ${range === 'all' ? 'All Time' : 'Last ' + range + ' Days'}</div>
                  <div>Generated: ${new Date().toLocaleDateString()}</div>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Note</th>
                    <th style="text-align: right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map(t => {
                    const typeClass = t.type;
                    const formattedAmt = (t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '') + formatCurrency(t.amount, currency);
                    const categoryName = t.categoryId ? categoryById[t.categoryId]?.name ?? '' : 'Transfer';
                    const accountName = accountById[t.accountId]?.name ?? '';
                    return `
                      <tr>
                        <td>${new Date(t.date).toLocaleDateString()}</td>
                        <td class="${typeClass}">${t.type.toUpperCase()}</td>
                        <td>${categoryName}</td>
                        <td>${accountName}</td>
                        <td>${t.note || '-'}</td>
                        <td style="text-align: right;" class="${typeClass}">${formattedAmt}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              <div class="total">
                Total Transactions: ${sorted.length}
              </div>
              <script>
                window.onload = function() {
                  window.print();
                  setTimeout(function() { window.close(); }, 500);
                };
              </script>
            </body>
          </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } else {
      RNAlert.alert('PDF Export', 'PDF Export is optimized for the web preview. Please use CSV format on native mobile.');
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
          Export your transactions as a CSV file you can open in Excel, Sheets, or Numbers.
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

        <SectionHeader title="Export format" />
        <Card style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => setFormat('csv')}
            style={[styles.rangeRow, format === 'csv' && styles.rangeRowActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="document-text-outline" size={20} color={format === 'csv' ? colors.primary : colors.textMuted} />
              <Text style={[styles.rangeText, format === 'csv' && styles.rangeTextActive]}>CSV Spreadsheet (.csv)</Text>
            </View>
            {format === 'csv' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </Pressable>
          <Pressable
            onPress={() => setFormat('pdf')}
            style={[styles.rangeRow, format === 'pdf' && styles.rangeRowActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="document-outline" size={20} color={format === 'pdf' ? colors.primary : colors.textMuted} />
              <Text style={[styles.rangeText, format === 'pdf' && styles.rangeTextActive]}>PDF Document (.pdf)</Text>
            </View>
            {format === 'pdf' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </Pressable>
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
          label={`Export ${sorted.length} transactions as ${format.toUpperCase()}`}
          onPress={format === 'csv' ? onExport : onExportPdf}
          loading={exporting}
          style={{ marginTop: spacing.xl }}
        />
        <Text style={styles.footnote}>
          {format === 'csv'
            ? 'Downloads your CSV data to your device immediately.'
            : 'Generates a clean PDF document print layout for download.'}
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