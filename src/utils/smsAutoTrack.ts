import SmsListener from 'react-native-android-sms-listener';
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
  if (Platform.OS !== 'android') return;
  stopSmsAutoTrack();

  subscription = SmsListener.addListener((message: SmsMessage) => {
    const sender = message.originatingAddress || '';
    const body = message.body || '';

    if (!isBankSender(sender)) return;

    const parsed = parseTransactionSms(body);
    if (!parsed) return;

    const category = inferCategory(body.toLowerCase());

    useFinanceStore.getState().addTransaction({
      type: parsed.type,
      amount: parsed.amount,
      accountId,
      categoryId: category,
      note: `Auto-tracked: ${sender}`,
      date: new Date().toISOString(),
    });
  });
}

export function stopSmsAutoTrack() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}