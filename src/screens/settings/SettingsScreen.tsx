import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Switch, Image, ScrollView } from 'react-native';
import { Alert } from '../../utils/alerts';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, SectionHeader, Card, Button, FormInput } from '../../components/ui';
import { CategoryIcon } from '../../components/finance';
import { colors, fonts, fontSizes, radii, spacing } from '../../theme';
import { useFinanceStore } from '../../store/useFinanceStore';
import { requestSmsPermission, hasSmsPermission, startSmsAutoTrack, stopSmsAutoTrack } from '../../utils/smsAutoTrack';
import { Platform } from 'react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { formatCurrency } from '../../utils/format';
import { MainTabParamList, RootStackParamList } from '../../navigation/types';
import * as ImagePicker from 'expo-image-picker';
import SecuritySection from './SecuritySection';
import VersionBadge from '../../components/VersionBadge';


type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Settings'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
const SEXES = ['Male', 'Female', 'Other'];

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const logOut = useAuthStore((s) => s.logOut);
  const notificationsEnabled = useAuthStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useAuthStore((s) => s.setNotificationsEnabled);
  const accounts = useFinanceStore((s) => s.accounts);
  const [smsTrackEnabled, setSmsTrackEnabled] = useState(false);

React.useEffect(() => {
  hasSmsPermission().then(setSmsTrackEnabled);
}, []);

const handleToggleSmsTrack = async (value: boolean) => {
  if (Platform.OS !== 'android') {
    Alert.alert('Not available', 'SMS auto-tracking is only available on Android.');
    return;
  }
  if (value) {
    const granted = await requestSmsPermission();
    if (granted && accounts[0]?.id) {
      startSmsAutoTrack(accounts[0].id);
      setSmsTrackEnabled(true);
    } else {
      Alert.alert('Permission denied', 'SMS permission is required for auto-tracking.');
    }
  } else {
    stopSmsAutoTrack();
    setSmsTrackEnabled(false);
  }
};
  const resetToSeed = useFinanceStore((s) => s.resetToSeed);

  const [name, setName] = useState(user?.name ?? '');
  const [dob, setDob] = useState(user?.dob ?? '');
  const [age, setAge] = useState(user?.age ?? '');
  const [occupation, setOccupation] = useState(user?.occupation ?? '');
  const currency = user?.currency ?? 'USD';

  const handleDobChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;

    if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    }
    if (cleaned.length > 6) {
      formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    }
    setDob(formatted);

    // Calculate age dynamically once 10 characters are completed
    if (formatted.length === 10) {
      const computedAge = calculateAge(formatted);
      if (computedAge !== null) {
        setAge(computedAge.toString());
      } else {
        setAge('');
      }
    } else {
      setAge('');
    }
  };

  const calculateAge = (dobString: string): number | null => {
    const parts = dobString.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

    const birthDate = new Date(year, month, day);
    const today = new Date();

    if (birthDate > today || year < 1900) return null;

    let computedAge = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      computedAge--;
    }
    return computedAge >= 0 ? computedAge : null;
  };

  const handleDobSubmit = () => {
    const trimmedDob = dob.trim();
    if (!trimmedDob) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDob)) {
      setDob('');
      setAge('');
      Alert.alert('Invalid Format', 'Please enter your date of birth in YYYY-MM-DD format.');
      return;
    }

    const computedAge = calculateAge(trimmedDob);
    if (computedAge === null) {
      setDob('');
      setAge('');
      Alert.alert('Invalid Date', 'Please enter a valid past date of birth.');
      return;
    }

    const ageStr = computedAge.toString();
    setAge(ageStr);
    updateProfile({ dob: trimmedDob, age: ageStr });
  };

  const handleSelectAvatar = async () => {
    Alert.alert('Profile Picture', 'Choose an option to change your profile picture', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo (Camera)', onPress: () => launchAvatarPicker(true) },
      { text: 'Choose from Library', onPress: () => launchAvatarPicker(false) },
    ]);
  };

  const launchAvatarPicker = async (useCamera: boolean) => {
    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Camera permission is required to take photos!');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Photo library permission is required to select photos!');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        updateProfile({ avatarUri: result.assets[0].uri });
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error Selection', 'Failed to update profile picture.');
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    const success = await setNotificationsEnabled(value);
    if (!success && value) {
      Alert.alert(
        'Permission Denied',
        'Please enable notification permissions for Coinzy in your device settings to receive daily reminders.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Screen contentStyle={{ paddingTop: spacing.sm }}>
        <Text style={styles.title}>Settings</Text>

        <SectionHeader title="Profile" />
        <Card>
          <View style={styles.profileHeaderRow}>
            <Pressable onPress={handleSelectAvatar} style={styles.avatarContainer}>
              {user?.avatarUri ? (
                <Image source={{ uri: user.avatarUri }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatarPlaceholder, { backgroundColor: user?.avatarColor ?? colors.primary }]}>
                  <Text style={styles.profileAvatarPlaceholderText}>
                    {user?.name?.charAt(0).toUpperCase() ?? 'Y'}
                  </Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color={colors.white} />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileNameTitle}>{user?.name}</Text>
              <Text style={styles.profileEmailSubtitle}>{user?.email}</Text>
              <Text style={styles.profileDetailsSubtitle}>
                {user?.age ? `${user.age} yrs` : 'Age not set'} · {user?.occupation || 'No occupation'}
              </Text>
            </View>
          </View>

          <View style={styles.profileDivider} />

          <FormInput
            label="Name"
            value={name}
            onChangeText={setName}
            onEndEditing={() => updateProfile({ name: name.trim() || user?.name || 'You' })}
            onBlur={() => updateProfile({ name: name.trim() || user?.name || 'You' })}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <View style={styles.labelRow}>
                <Text style={styles.customLabel}>Date of Birth (YYYY-MM-DD)</Text>
                {!!user?.dob && <Ionicons name="lock-closed" size={12} color={colors.textFaint} style={{ marginLeft: 4 }} />}
              </View>
              <FormInput
                value={dob}
                onChangeText={handleDobChange}
                placeholder="1995-10-15"
                maxLength={10}
                keyboardType="numeric"
                onEndEditing={handleDobSubmit}
                onBlur={handleDobSubmit}
                editable={!user?.dob}
                style={user?.dob ? styles.disabledInput : undefined}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <View style={styles.labelRow}>
                <Text style={styles.customLabel}>Age</Text>
              </View>
              <FormInput
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                onEndEditing={() => updateProfile({ age: age.trim() })}
                onBlur={() => updateProfile({ age: age.trim() })}
                placeholder="—"
                editable={true}
              />
            </View>
            <View style={{ flex: 2, marginLeft: spacing.md }}>
              <View style={styles.labelRow}>
                <Text style={styles.customLabel}>Occupation</Text>
                {!!user?.occupation && <Ionicons name="lock-closed" size={12} color={colors.textFaint} style={{ marginLeft: 4 }} />}
              </View>
              <FormInput
                value={occupation}
                onChangeText={setOccupation}
                onEndEditing={() => updateProfile({ occupation: occupation.trim() })}
                onBlur={() => updateProfile({ occupation: occupation.trim() })}
                placeholder="Software Engineer"
                editable={!user?.occupation}
                style={user?.occupation ? styles.disabledInput : undefined}
              />
            </View>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.customLabel}>Marital Status</Text>
            {!!user?.maritalStatus && <Ionicons name="lock-closed" size={12} color={colors.textFaint} style={{ marginLeft: 4 }} />}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
            <View style={styles.row}>
              {MARITAL_STATUSES.map((status) => {
                const active = user?.maritalStatus === status;
                const isLocked = !!user?.maritalStatus;
                return (
                  <Pressable
                    key={status}
                    onPress={() => {
                      if (!isLocked) {
                        updateProfile({ maritalStatus: status });
                      }
                    }}
                    disabled={isLocked}
                    style={[
                      styles.chip,
                      active && styles.chipActive,
                      isLocked && !active && styles.disabledChip,
                    ]}
                  >
                    <Text style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                      isLocked && !active && styles.disabledChipText,
                    ]}>
                      {status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={styles.label}>Sex</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xs }}>
            <View style={styles.row}>
              {SEXES.map((s) => {
                const active = user?.sex === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => updateProfile({ sex: s })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        <SectionHeader title="Currency" />
        <Card>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => {
              const active = c === currency;
              return (
                <Pressable
                  key={c}
                  onPress={() => updateProfile({ currency: c })}
                  style={[styles.currencyChip, active && styles.currencyChipActive]}
                >
                  <Text style={[styles.currencyText, active && styles.currencyTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <SectionHeader title="Accounts" />
        <Card style={{ gap: 0 }}>
          {accounts.map((acc, idx) => (
            <View key={acc.id}>
              <View style={styles.accountRow}>
                <CategoryIcon icon={acc.icon} color={acc.color} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{acc.name}</Text>
                  <Text style={styles.accountType}>{acc.type}</Text>
                </View>
                <Text style={[styles.accountBalance, acc.balance < 0 && { color: colors.expense }]}>
                  {formatCurrency(acc.balance, currency)}
                </Text>
              </View>
              {idx < accounts.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

        <SectionHeader title="Notifications" />
        <Card>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={styles.toggleLabel}>Daily Reminders</Text>
              <Text style={styles.toggleSublabel}>Receive a reminder at 8:00 PM to log daily expenses</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </Card>

        <SecuritySection />

        <SectionHeader title="Data" />
        <Card style={{ gap: 0 }}>
          <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Recurring')}>
            <Ionicons name="repeat-outline" size={20} color={colors.text} />
            <Text style={styles.linkText}>Recurring Transactions</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Export')}>
            <Ionicons name="download-outline" size={20} color={colors.text} />
            <Text style={styles.linkText}>Export data (CSV / PDF)</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.linkRow} onPress={() => navigation.navigate('UPISync')}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkText}>UPI SMS Sync</Text>
              <Text style={[styles.linkText, { fontSize: 12, color: colors.textFaint, fontFamily: fonts.body, marginTop: 1 }]}>Import transactions from UPI SMS</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.linkRow}
            onPress={() =>
              Alert.alert('Clear all data', 'This will permanently delete all transactions and reset account balances to zero.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await resetToSeed();
                      Alert.alert('Success', 'All data has been cleared successfully.');
                    } catch (error) {
                      Alert.alert('Error', 'Failed to clear data on the server. Please check your connection.');
                    }
                  },
                },
              ])
            }
          >
            <Ionicons name="trash-outline" size={20} color={colors.expense} />
            <Text style={[styles.linkText, { color: colors.expense }]}>Clear all data</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        </Card>

        <SectionHeader title="Account" />
        <Button label="Log out" variant="secondary" onPress={logOut} />

        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={styles.footerText}>Coinzy · local-first build</Text>
          <Text style={styles.footerSubtext}>
            Your data is stored locally and securely synchronized with the Coinzy cloud backend.
          </Text>
          <VersionBadge />
        </View>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl },
  staticLabel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginBottom: 4 },
  staticValue: { color: colors.text, fontFamily: fonts.body, fontSize: fontSizes.md },
  currencyRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  currencyChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  currencyChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  currencyText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  currencyTextActive: { color: colors.primary },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  accountName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  accountType: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs, textTransform: 'capitalize', marginTop: 2 },
  accountBalance: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.md },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  linkText: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  footerText: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  footerSubtext: {
    color: colors.textFaint,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  toggleLabel: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
  },
  toggleSublabel: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    marginTop: 4,
  },
  // Extended Profile Styling
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xs,
  },
  avatarContainer: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    resizeMode: 'cover',
  },
  profileAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarPlaceholderText: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileNameTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.lg,
  },
  profileEmailSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  profileDetailsSubtitle: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    marginTop: 4,
  },
  profileDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.sm,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
  },
  chipTextActive: {
    color: colors.primary,
  },
  disabledInput: {
    opacity: 0.6,
    color: colors.textMuted,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  customLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
  },
  disabledChip: {
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  disabledChipText: {
    color: colors.textFaint,
  },
});
