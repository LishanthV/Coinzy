// import SmsListener from 'react-native-android-sms-listener'; // Temporarily disabled - incompatible with Expo SDK 54
import { PermissionsAndroid, Platform } from 'react-native';
import { useFinanceStore } from '../store/useFinanceStore';

interface SmsMessage {
  originatingAddress: string;
  body: string;
  timestamp: number;
}

let subscription: { remove: () => void } | null = null;

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      {
        title: 'SMS Permission',
        message: 'Coinzy needs SMS access to automatically track your UPI transactions from bank alerts.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
}

function isBankSender(sender: string): boolean {
  return /^[A-Z]{2}-[A-Z0-9]+$/i.test(sender) || /^[A-Za-z0-9]{6,8}$/.test(sender);
}

function inferCategory(text: string): string {
  if (text.includes('zomato') || text.includes('swiggy') || text.includes('restaurant')) return 'cat_food_exp';
  if (text.includes('uber') || text.includes('ola') || text.includes('fuel') || text.includes('metro')) return 'cat_transport_exp';
  if (text.includes('netflix') || text.includes('spotify') || text.includes('prime')) return 'cat_entertainment_exp';
  if (text.includes('amazon') || text.includes('flipkart') || text.includes('myntra')) return 'cat_shopping_exp';
  return 'cat_other_exp';
}

function parseTransactionSms(body: string): { type: 'income' | 'expense'; amount: number } | null {
  const lower = body.toLowerCase();
  let type: 'income' | 'expense' | null = null;

  if (lower.includes('debited') || lower.includes('spent') || lower.includes('paid')) {
    type = 'expense';
  } else if (lower.includes('credited') || lower.includes('received')) {
    type = 'income';
  }
  if (!type) return null;

  const match = body.match(/(?:rs|inr)\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;

  return { type, amount };
}

export function startSmsAutoTrack(accountId: string) {
  // SMS auto-tracking temporarily disabled — react-native-android-sms-listener
  // is not compatible with Expo SDK 54 / React Native 0.81.
  // TODO: Replace with expo-sms or a bare workflow native module.
  console.log('[smsAutoTrack] SMS tracking disabled for testing');
}

export function stopSmsAutoTrack() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}