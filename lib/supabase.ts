import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const webStorage: SupportedStorage = {
  getItem: async (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

const nativeStorage: SupportedStorage = {
  getItem: async (key: string) => {
    return await AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
};

const storage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});