import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SectionHeader, EmptyState } from '../../components/ui';
import { CategoryIcon, TransactionRow } from '../../components/finance';
import { RingGauge } from '../../components/charts';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTotalBalance, useNetForMonth } from '../../store/selectors';
import { formatCurrency } from '../../utils/format';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const totalBalance = useTotalBalance();
  const { income, expense } = useNetForMonth();

  const currency = user?.currency ?? 'USD';
  const firstName = (user?.name ?? 'there').split(' ')[0];

  const spentRatio = income > 0 ? expense / income : expense > 0 ? 1 : 0;
  const recent = transactions.slice(0, 5);

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {firstName}</Text>
            <Text style={styles.subGreeting}>Here's where things stand</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [
              styles.avatar,
              { backgroundColor: user?.avatarColor ?? colors.primary, overflow: 'hidden' },
              pressed && { opacity: 0.8 },
            ]}
          >
            {user?.avatarUri ? (
              <Image source={{ uri: user.avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
            )}
          </Pressable>
        </View>

        {/* Balance card */}
        <LinearGradient
          colors={[colors.surfaceRaised, colors.surfaceAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Total balance</Text>
          <Text style={styles.balanceValue}>{formatCurrency(totalBalance, currency)}</Text>

          <View style={styles.balanceRow}>
            <View style={styles.balanceStat}>
              <View style={[styles.dot, { backgroundColor: colors.income }]} />
              <View>
                <Text style={styles.statLabel}>Income this month</Text>
                <Text style={[styles.statValue, { color: colors.income }]}>
                  {formatCurrency(income, currency)}
                </Text>
              </View>
            </View>
            <View style={styles.balanceStat}>
              <View style={[styles.dot, { backgroundColor: colors.expense }]} />
              <View>
                <Text style={styles.statLabel}>Spent this month</Text>
                <Text style={[styles.statValue, { color: colors.expense }]}>
                  {formatCurrency(expense, currency)}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Flow ring */}
        <View style={styles.flowCard}>
          <RingGauge
            progress={spentRatio}
            color={spentRatio > 0.9 ? colors.expense : colors.primary}
            value={`${Math.round(spentRatio * 100)}%`}
            label="of income spent"
          />
          <View style={styles.flowText}>
            <Text style={styles.flowTitle}>This month's flow</Text>
            <Text style={styles.flowSubtitle}>
              {income > 0
                ? spentRatio < 1
                  ? `You've spent ${Math.round(spentRatio * 100)}% of what you've earned. ${formatCurrency(
                      income - expense,
                      currency
                    )} left to plan with.`
                  : `Spending has passed income by ${formatCurrency(expense - income, currency)} this month.`
                : `You've spent ${formatCurrency(expense, currency)} so far, with no income logged yet.`}
            </Text>
          </View>
        </View>

        {/* Accounts */}
        <SectionHeader
          title="Accounts"
          action="Manage"
          onPressAction={() => navigation.navigate('Settings')}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }}>
          <View style={styles.accountsRow}>
            {accounts.map((acc) => (
              <View key={acc.id} style={styles.accountCard}>
                <CategoryIcon icon={acc.icon} color={acc.color} size={36} />
                <Text style={styles.accountName}>{acc.name}</Text>
                <Text
                  style={[
                    styles.accountBalance,
                    { color: acc.balance < 0 ? colors.expense : colors.text },
                  ]}
                >
                  {formatCurrency(acc.balance, currency)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Recent transactions */}
        <SectionHeader
          title="Recent activity"
          action="See all"
          onPressAction={() => navigation.navigate('History')}
        />
        <View style={styles.listCard}>
          {recent.length === 0 ? (
            <EmptyState title="No transactions yet" subtitle="Tap the + button to add your first one." />
          ) : (
            recent.map((txn, idx) => (
              <View key={txn.id}>
                <TransactionRow
                  transaction={txn}
                  category={txn.categoryId ? categoryById[txn.categoryId] : undefined}
                  accountName={accountById[txn.accountId]?.name}
                  currency={currency}
                  onPress={() => navigation.navigate('TxnDetail', { id: txn.id })}
                />
                {idx < recent.length - 1 && <View style={styles.divider} />}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl * 1.5 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl },
  subGreeting: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: fonts.displayBold, fontSize: fontSizes.lg },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  balanceCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  balanceValue: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  balanceRow: { flexDirection: 'row', gap: spacing.xl },
  balanceStat: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs },
  statValue: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md, marginTop: 2 },

  flowCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  flowText: { flex: 1 },
  flowTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md, marginBottom: 4 },
  flowSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.sm, lineHeight: 18 },

  accountsRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.md },
  accountCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  accountName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  accountBalance: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
  },
  divider: { height: 1, backgroundColor: colors.borderSoft },
});
