import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import StatisticsScreen from '../screens/statistics/StatisticsScreen';
import BudgetsScreen from '../screens/budgets/BudgetsScreen';
import RecurringScreen from '../screens/recurring/RecurringScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useAppTheme, fonts, fontSizes, colors } from '../theme';
import { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Dashboard: { active: 'home', inactive: 'home-outline' },
  History: { active: 'list', inactive: 'list-outline' },
  Statistics: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  Budgets: { active: 'wallet', inactive: 'wallet-outline' },
  Recurring: { active: 'repeat', inactive: 'repeat-outline' },
  Settings: { active: 'person', inactive: 'person-outline' },
};

function FAB() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      onPress={() => navigation.navigate('AddTransaction', {})}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
    >
      <Ionicons name="add" size={28} color={colors.white} />
    </Pressable>
  );
}

export function MainNavigator() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64 + insets.bottom;
  const { colors: themeColors } = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: themeColors.surface,
          borderTopColor: themeColors.borderSoft,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;
          return <Ionicons name={iconName as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => (
            <View style={styles.fabContainer}>
              <FAB />
            </View>
          ),
        }}
      />
      <Tab.Screen name="Budgets" component={BudgetsScreen} />
      <Tab.Screen name="Recurring" component={RecurringScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  fabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    top: -24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
});