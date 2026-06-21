import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.startsWith('YOUR_') && 
  !supabaseAnonKey.startsWith('YOUR_');

console.log('[Supabase Init] config:', {
  supabaseUrl: supabaseUrl || 'undefined/empty',
  hasAnonKey: !!supabaseAnonKey,
  isConfigured
});

// Use placeholder values if not configured to prevent startup crashes
const activeUrl = isConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const activeAnonKey = isConfigured ? supabaseAnonKey : 'placeholder-key';

if (!isConfigured) {
  console.warn(
    'Supabase environment variables (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY) are missing or not configured in your .env file. The app will run in Demo Fallback Mode.'
  );
}


export const supabase = createClient(activeUrl, activeAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

