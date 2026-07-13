import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, SectionHeader, Button } from '../components/ui';
import { colors, fonts, fontSizes, spacing, radii } from '../theme';
import { PermissionsAndroid } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import { useAuthStore } from '../store/useAuthStore';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCurrency } from '../utils/format';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParsedUpiTxn {
  amount: number;
  type: 'income' | 'expense';
  merchant: string | null;
  date: string;
  upiRef: string | null;
  rawSms: string;
  selected: boolean;
}

// ── Sample SMS for demo (used on web where SMS API not available) ──────────────
const DEMO_SMS = [
  'INR 540.00 debited from A/c XX1234 on 10-07-2026 to Swiggy UPI Ref 123456789012.',
  'INR 10000.00 credited to A/c XX1234 on 05-07-2026 from Salary HDFC. UPI Ref 987654321098.',
  'Rs.299 debited via UPI. Paid to Netflix on 08-07-2026. Ref No. 112233445566.',
  'INR 1200 sent to Amazon Pay on 07-07-2026. UPI Ref 556677889900.',
  'You received INR 500 from Ravi Kumar on 06-07-2026. UPI Ref 334455667788.',
];

export default function UPISyncScreen() {
  const navigation = useNavigation();
  const { accessToken } = useAuthStore();
  const { accounts } = useFinanceStore();
  const currency = useAuthStore((s) => s.user?.currency ?? 'INR');

  const [step, setStep] = useState<'intro' | 'parsing' | 'preview' | 'syncing' | 'done'>('intro');
  const [parsedTxns, setParsedTxns] = useState<ParsedUpiTxn[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '');
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Parse step ────────────────────────────────────────────────────────────
 const readRealSms = (): Promise<string[]> => {
    return new Promise(async (resolve) => {
      if (Platform.OS !== 'android') {
        resolve(DEMO_SMS);
        return;
      }
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS Permission',
          message: 'Coinzy needs SMS access to import your UPI transaction history.',
          buttonPositive: 'Allow',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        resolve(DEMO_SMS);
        return;
      }
      const filter = { box: 'inbox', maxCount: 100 };
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: any) => {
          console.log('SMS read failed:', fail);
          resolve(DEMO_SMS);
        },
        (count: number, smsList: string) => {
          const parsed = JSON.parse(smsList);
          const bodies = parsed.map((sms: any) => sms.body).filter(Boolean);
          resolve(bodies.length > 0 ? bodies : DEMO_SMS);
        }
      );
    });
  };

  // ── Parse step ────────────────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    setStep('parsing');
    setError(null);
    try {
      const messages = await readRealSms();
      const res = await fetch(`${BASE_URL}/api/upi/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');

      setParsedTxns(
        (data.parsed as Omit<ParsedUpiTxn, 'selected'>[]).map((t) => ({ ...t, selected: true }))
      );
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
      setStep('intro');
    }
  }, [accessToken]);

  // ── Toggle selection ──────────────────────────────────────────────────────
  const toggleSelect = useCallback((index: number) => {
    setParsedTxns((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  }, []);

  // ── Sync step ─────────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    const toSync = parsedTxns.filter((t) => t.selected);
    if (toSync.length === 0) {
      Alert.alert('Nothing selected', 'Please select at least one transaction to import.');
      return;
    }
    if (!selectedAccountId) {
      Alert.alert('No account', 'Please select an account to import into.');
      return;
    }
    setStep('syncing');
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/upi/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ transactions: toSync, accountId: selectedAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setImportResult({ imported: data.imported, skipped: data.skipped });
      setStep('done');
    } catch (err: any) {
      setError(err.message);
      setStep('preview');
    }
  }, [parsedTxns, selectedAccountId, accessToken]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderTxnItem = ({ item, index }: { item: ParsedUpiTxn; index: number }) => (
    <Pressable onPress={() => toggleSelect(index)} style={styles.txnRow}>
      <View style={[styles.checkbox, item.selected && styles.checkboxActive]}>
        {item.selected && <Ionicons name="checkmark" size={14} color={colors.white} />}
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnMerchant} numberOfLines={1}>
          {item.merchant || 'UPI Transaction'}
        </Text>
        <Text style={styles.txnDate}>{item.date}</Text>
      </View>
      <Text style={[styles.txnAmount, item.type === 'income' ? styles.income : styles.expense]}>
        {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount, currency)}
      </Text>
    </Pressable>
  );

  // ── Screens ───────────────────────────────────────────────────────────────
  if (step === 'intro' || step === 'parsing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>UPI SMS Sync</Text>
          <View style={{ width: 26 }} />
        </View>

        <Screen contentStyle={{ paddingTop: spacing.xl }}>
          {/* Hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Import UPI Transactions</Text>
            <Text style={styles.heroSubtitle}>
              Automatically read your UPI SMS messages and import them as transactions — no manual entry needed.
            </Text>
          </View>

          {/* Steps */}
          <SectionHeader title="How it works" />
          <Card style={{ gap: spacing.md }}>
            {[
              { icon: 'chatbox-outline', text: 'We scan your UPI SMS messages' },
              { icon: 'sparkles-outline', text: 'AI parses amount, merchant & date' },
              { icon: 'eye-outline', text: 'You review & select what to import' },
              { icon: 'cloud-upload-outline', text: 'Imported to your chosen account' },
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Ionicons name={step.icon as any} size={18} color={colors.primary} />
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </Card>

          {Platform.OS !== 'android' && (
            <Card style={styles.webNote}>
              <Ionicons name="information-circle-outline" size={18} color={colors.amber} />
              <Text style={styles.webNoteText}>
                SMS reading is only available on Android. On web/iOS, demo transactions are used for preview.
              </Text>
            </Card>
          )}

          {error && (
            <Card style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <Button
            label={step === 'parsing' ? 'Scanning messages…' : 'Scan UPI Messages'}
            onPress={handleParse}
            loading={step === 'parsing'}
            style={{ marginTop: spacing.xl }}
          />
        </Screen>
      </SafeAreaView>
    );
  }

  if (step === 'preview') {
    const selectedCount = parsedTxns.filter((t) => t.selected).length;
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => setStep('intro')} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Review Transactions</Text>
          <Pressable onPress={() => setParsedTxns((p) => p.map((t) => ({ ...t, selected: !p.every((x) => x.selected) })))}>
            <Text style={styles.selectAll}>{parsedTxns.every((t) => t.selected) ? 'Deselect all' : 'Select all'}</Text>
          </Pressable>
        </View>

        {/* Account selector */}
        <View style={styles.accountStrip}>
          <Text style={styles.accountLabel}>Import into:</Text>
          <FlatList
            data={accounts}
            keyExtractor={(a) => a.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedAccountId(item.id)}
                style={[styles.accountChip, selectedAccountId === item.id && styles.accountChipActive]}
              >
                <Text style={[styles.accountChipText, selectedAccountId === item.id && styles.accountChipTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>

        <FlatList
          data={parsedTxns}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderTxnItem}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No UPI transactions found in your messages.</Text>
          }
        />

        <View style={styles.bottomBar}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Button
            label={`Import ${selectedCount} transaction${selectedCount !== 1 ? 's' : ''}`}
            onPress={handleSync}
            style={{ flex: 1 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'syncing') {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.syncingText}>Importing transactions…</Text>
      </SafeAreaView>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, styles.centered]}>
      <View style={styles.doneIcon}>
        <Ionicons name="checkmark-circle" size={72} color={colors.income} />
      </View>
      <Text style={styles.doneTitle}>Import Complete!</Text>
      <Text style={styles.doneSubtitle}>
        {importResult?.imported} transaction{importResult?.imported !== 1 ? 's' : ''} imported successfully.
        {importResult?.skipped ? ` (${importResult.skipped} duplicates skipped)` : ''}
      </Text>
      <Button label="Done" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl, minWidth: 160 }} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg },
  selectAll: { color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: fontSizes.xl, textAlign: 'center' },
  heroSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22 },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.xs },
  stepText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: fontSizes.sm },

  webNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  webNoteText: { flex: 1, color: colors.amber, fontFamily: fonts.body, fontSize: fontSizes.xs, lineHeight: 18 },

  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  errorText: { flex: 1, color: colors.danger, fontFamily: fonts.body, fontSize: fontSizes.xs },

  accountStrip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  accountLabel: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs },
  accountChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  accountChipText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs },
  accountChipTextActive: { color: colors.primary },

  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  txnInfo: { flex: 1 },
  txnMerchant: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  txnDate: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, marginTop: 2 },
  txnAmount: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  income: { color: colors.income },
  expense: { color: colors.expense },

  divider: { height: 1, backgroundColor: colors.borderSoft, marginLeft: spacing.lg + 22 + spacing.md },
  emptyText: { textAlign: 'center', color: colors.textFaint, fontFamily: fonts.body, fontSize: fontSizes.md, marginTop: spacing.xxxl },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },

  syncingText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.md, marginTop: spacing.md },
  doneIcon: { marginBottom: spacing.sm },
  doneTitle: { color: colors.text, fontFamily: fonts.display, fontSize: fontSizes.xl },
  doneSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.md, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 22 },
});
