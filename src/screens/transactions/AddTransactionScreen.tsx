import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormInput } from '../../components/ui';
import { CategoryIcon } from '../../components/finance';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { currencySymbol } from '../../utils/format';
import { RootStackParamList } from '../../navigation/types';
import { TxnType } from '../../types';
import * as ImagePicker from 'expo-image-picker';
import { scanReceiptImage } from '../../utils/scanReceipt';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddTransaction'>;
type Route = RouteProp<RootStackParamList, 'AddTransaction'>;

const TYPES: { id: TxnType; label: string; color: string }[] = [
  { id: 'expense', label: 'Expense', color: colors.expense },
  { id: 'income', label: 'Income', color: colors.income },
  { id: 'transfer', label: 'Transfer', color: colors.transfer },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHIP_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 3) / 4;

export default function AddTransactionScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const editId = params?.editId;

  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'INR';

  const existing = editId ? transactions.find((t) => t.id === editId) : undefined;

  const [type, setType] = useState<TxnType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? existing.amount.toString() : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id);
  const [categoryId, setCategoryId] = useState(existing?.categoryId);
  const [customCategory, setCustomCategory] = useState(existing?.customCategory ?? '');
  const [error, setError] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [customMerchant, setCustomMerchant] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customItems, setCustomItems] = useState('');

  const [scannedMerchant, setScannedMerchant] = useState<string | undefined>(existing?.merchant);
  const [scannedItems, setScannedItems] = useState<{ name: string; price: number; quantity?: number }[]>(existing?.items ?? []);

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  );

  React.useEffect(() => {
    if (type === 'transfer') { setCategoryId(undefined); return; }
    if (!availableCategories.find((c) => c.id === categoryId)) {
      setCategoryId(availableCategories[0]?.id);
    }
  }, [type]);

  const handleScanReceipt = () => setShowScanOptions(true);

  const startScan = async (useCamera: boolean) => {
    setShowScanOptions(false);
    try {
      const amtVal = parseFloat(customAmount);
      const hasCustom = customMerchant.trim() !== '' && !isNaN(amtVal) && amtVal > 0;

      if (hasCustom) {
        setIsScanning(true);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setIsScanning(false);
        setType('expense');
        setAmount(amtVal.toFixed(2));
        setNote(customMerchant.trim());
        setScannedMerchant(customMerchant.trim());
        let itemsList: { name: string; price: number; quantity: number }[] = [];
        if (customItems.trim() !== '') {
          itemsList = customItems.split(',').map(item => {
            const parts = item.split(':');
            const name = parts[0]?.trim();
            const priceStr = parts[1]?.trim();
            if (name && priceStr) {
              const price = parseFloat(priceStr);
              if (!isNaN(price)) return { name, price, quantity: 1 };
            }
            return null;
          }).filter(x => x !== null) as { name: string; price: number; quantity: number }[];
        }
        if (itemsList.length === 0) {
          itemsList = [{ name: `${customMerchant.trim()} Purchase`, price: amtVal, quantity: 1 }];
        }
        setScannedItems(itemsList);
        setCategoryId('cat_other_exp');
        setCustomMerchant(''); setCustomAmount(''); setCustomItems('');
        return;
      }

      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { alert('Permission to access camera is required!'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { alert('Permission to access photos is required!'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsScanning(true);
        const ocrResult = await scanReceiptImage(result.assets[0].uri);
        setIsScanning(false);
        setType('expense');
        const finalMerchant = ocrResult.merchant || 'Scanned Receipt';
        const finalAmount = ocrResult.amount || 0;
        setAmount(finalAmount > 0 ? finalAmount.toFixed(2) : '');
        setNote(finalMerchant);
        setScannedMerchant(finalMerchant);
        setScannedItems(ocrResult.items || []);
        const matchedCat = categories.find(c =>
          c.type === 'expense' &&
          (c.name.toLowerCase().includes(finalMerchant.toLowerCase()) ||
           finalMerchant.toLowerCase().includes(c.name.toLowerCase()))
        );
        setCategoryId(matchedCat?.id ?? 'cat_other_exp');
      }
    } catch (e) {
      setIsScanning(false);
      alert('Scanning failed.');
    }
  };

  const onSubmit = () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (!accountId) { setError('Choose an account.'); return; }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      setError('Choose a different destination account.'); return;
    }
    if (type !== 'transfer' && !categoryId) { setError('Choose a category.'); return; }

    const isOther = categoryId === 'cat_other_exp' || categoryId === 'cat_other_inc';
    const payload = {
      type, amount: value, accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type === 'transfer' ? undefined : categoryId,
      customCategory: (type !== 'transfer' && isOther) ? customCategory.trim() : undefined,
      note: note.trim(),
      date: existing?.date ?? new Date().toISOString(),
      merchant: type === 'expense' ? scannedMerchant : undefined,
      items: type === 'expense' ? scannedItems : undefined,
    };

    if (existing) { updateTransaction(existing.id, payload); } else { addTransaction(payload); }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{existing ? 'Edit transaction' : 'Add transaction'}</Text>
        {existing ? (
          <View style={{ width: 50 }} />
        ) : (
          <Pressable onPress={handleScanReceipt} style={styles.scanHeaderBtn} hitSlop={12}>
            <Ionicons name="scan-outline" size={20} color={colors.primary} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!existing && (
          <Pressable onPress={handleScanReceipt} style={styles.scanBanner}>
            <Ionicons name="camera-outline" size={20} color={colors.primary} />
            <Text style={styles.scanBannerText}>Scan receipt to auto-fill details</Text>
          </Pressable>
        )}

        {scannedItems.length > 0 && type === 'expense' && (
          <View style={styles.scannedDetailsContainer}>
            <Text style={styles.scannedLabel}>Scanned Receipt Details</Text>
            <View style={styles.scannedCard}>
              <View style={styles.scannedMerchantRow}>
                <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                <Text style={styles.scannedMerchantText}>{scannedMerchant}</Text>
              </View>
              <View style={styles.scannedDivider} />
              {scannedItems.map((item, idx) => (
                <View key={idx} style={styles.scannedItemRow}>
                  <Text style={styles.scannedItemName}>• {item.name}</Text>
                  <Text style={styles.scannedItemPrice}>{currencySymbol(currency)}{item.price.toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.scannedDivider} />
              <View style={styles.scannedTotalRow}>
                <Text style={styles.scannedTotalLabel}>Total Items Sum:</Text>
                <Text style={styles.scannedTotalValue}>
                  {currencySymbol(currency)}{scannedItems.reduce((sum, i) => sum + i.price, 0).toFixed(2)}
                </Text>
              </View>
              <Pressable onPress={() => { setScannedMerchant(undefined); setScannedItems([]); }} style={styles.clearScanBtn}>
                <Text style={styles.clearScanBtnText}>Remove Scanned Details</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Type selector */}
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const active = type === t.id;
            return (
              <Pressable key={t.id} onPress={() => setType(t.id)}
                style={[styles.typeChip, active && { borderColor: t.color, backgroundColor: `${t.color}22` }]}>
                <Text style={[styles.typeText, active && { color: t.color }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Amount */}
        <View style={styles.amountWrap}>
          <Text style={styles.currencySymbol}>{currencySymbol(currency)}</Text>
          <FormInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" style={styles.amountInput} />
        </View>

        <FormInput label="Note" value={note} onChangeText={setNote} placeholder="What was this for?" />

        {/* Account */}
        <Text style={styles.label}>{type === 'transfer' ? 'From account' : 'Account'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
          <View style={styles.row}>
            {accounts.map((acc) => {
              const active = acc.id === accountId;
              return (
                <Pressable key={acc.id} onPress={() => setAccountId(acc.id)}
                  style={[styles.accountChip, active && { borderColor: acc.color, backgroundColor: `${acc.color}22` }]}>
                  <CategoryIcon icon={acc.icon} color={acc.color} size={28} />
                  <Text style={styles.accountChipText}>{acc.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {type === 'transfer' ? (
          <>
            <Text style={styles.label}>To account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={styles.row}>
                {accounts.filter((a) => a.id !== accountId).map((acc) => {
                  const active = acc.id === toAccountId;
                  return (
                    <Pressable key={acc.id} onPress={() => setToAccountId(acc.id)}
                      style={[styles.accountChip, active && { borderColor: acc.color, backgroundColor: `${acc.color}22` }]}>
                      <CategoryIcon icon={acc.icon} color={acc.color} size={28} />
                      <Text style={styles.accountChipText}>{acc.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        ) : (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {availableCategories.map((cat) => {
                const active = cat.id === categoryId;
                return (
                  <Pressable key={cat.id} onPress={() => setCategoryId(cat.id)}
                    style={[styles.categoryChip, active && { borderColor: cat.color, backgroundColor: `${cat.color}22` }]}>
                    <CategoryIcon icon={cat.icon} color={cat.color} size={28} />
                    <Text style={styles.accountChipText} numberOfLines={1}>{cat.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {(categoryId === 'cat_other_exp' || categoryId === 'cat_other_inc') && (
              <FormInput label="Specify Category or Product Name" placeholder="e.g. Cinema, Gift, Books"
                value={customCategory} onChangeText={setCustomCategory} />
            )}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={existing ? 'Save changes' : 'Add transaction'} onPress={onSubmit} />
      </ScrollView>

      <Modal visible={isScanning} transparent animationType="fade">
        <View style={styles.scanModal}>
          <View style={styles.scanPopupCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.scanTitle}>Analyzing Receipt...</Text>
            <Text style={styles.scanSubtitle}>Recognizing text on-device via Tesseract</Text>
            <View style={styles.scanVisualBox}><View style={styles.scanLine} /></View>
          </View>
        </View>
      </Modal>

      <Modal visible={showScanOptions} transparent animationType="slide" onRequestClose={() => setShowScanOptions(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowScanOptions(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Scan Receipt</Text>
            <Text style={styles.modalSubtitle}>Choose a receipt source to auto-fill transaction details</Text>
            <ScrollView style={styles.customScanSection} keyboardShouldPersistTaps="handled">
              <Text style={styles.customScanLabel}>Simulate Custom Receipt Details (Optional)</Text>
              <FormInput label="Merchant (Shop Name)" placeholder="Starbucks, Target..." value={customMerchant} onChangeText={setCustomMerchant} />
              <FormInput label="Amount (Total)" placeholder="0.00" value={customAmount} onChangeText={setCustomAmount} keyboardType="decimal-pad" />
              <FormInput label="Items (e.g. Milk: 4.50, Bread: 3.20)" placeholder="Item1: price, Item2: price..." value={customItems} onChangeText={setCustomItems} />
            </ScrollView>
            <Button label="Take Photo (Camera)" onPress={() => startScan(true)} style={{ marginBottom: spacing.sm }} />
            <Button label="Choose from Library" variant="secondary" onPress={() => startScan(false)} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowScanOptions(false)} style={{ marginTop: spacing.sm }} />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  cancel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, width: 50 },
  headerTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  typeText: { color: colors.textMuted, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  currencySymbol: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl, marginBottom: spacing.lg },
  amountInput: { flex: 1, fontSize: fontSizes.display, fontFamily: fonts.displayBold, height: 64 },
  label: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  accountChip: {
    alignItems: 'center', gap: spacing.xs, padding: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, width: 88, backgroundColor: colors.surfaceAlt,
  },
  accountChipText: { color: colors.text, fontFamily: fonts.body, fontSize: fontSizes.xs, textAlign: 'center' },
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg,
  },
  categoryChip: {
    alignItems: 'center', gap: spacing.xs, padding: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    width: CHIP_SIZE, backgroundColor: colors.surfaceAlt,
  },
  error: { color: colors.expense, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginBottom: spacing.md, textAlign: 'center' },
  scanHeaderBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  scanBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSoft, borderWidth: 1,
    borderRadius: radii.md, paddingVertical: 12, marginBottom: spacing.lg,
  },
  scanBannerText: { color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm },
  scanModal: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scanPopupCard: {
    width: '100%', maxWidth: 320, backgroundColor: colors.surface,
    borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  scanTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.lg, marginTop: spacing.md, marginBottom: 4 },
  scanSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm, textAlign: 'center', marginBottom: spacing.lg },
  scanVisualBox: {
    width: '100%', height: 120, borderRadius: radii.md, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', position: 'relative', justifyContent: 'center',
  },
  scanLine: { height: 4, backgroundColor: colors.primary, opacity: 0.6, borderRadius: 2, marginHorizontal: 12 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl, borderWidth: 1, borderColor: colors.border, maxHeight: '80%',
  },
  modalTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.lg, marginBottom: 4 },
  modalSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm, marginBottom: spacing.lg },
  customScanSection: {
    backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, maxHeight: 280,
  },
  customScanLabel: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, marginBottom: spacing.sm },
  scannedDetailsContainer: { marginBottom: spacing.lg },
  scannedLabel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginBottom: spacing.sm },
  scannedCard: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.md },
  scannedMerchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scannedMerchantText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  scannedDivider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  scannedItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  scannedItemName: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm },
  scannedItemPrice: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  scannedTotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scannedTotalLabel: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm },
  scannedTotalValue: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.md },
  clearScanBtn: {
    marginTop: spacing.md, paddingVertical: 8, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center',
  },
  clearScanBtnText: { color: colors.expense, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs },
});