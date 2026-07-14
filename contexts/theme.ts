/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const AppPalettes = {
  light: {
    scheme: 'light',
    background: '#ffffff',
    canvas: '#f9fafb',
    surface: '#ffffff',
    surfaceMuted: '#f9fafb',
    surfaceSoft: '#f3f4f6',
    input: '#ffffff',
    text: '#111827',
    textMuted: '#6b7280',
    textSubtle: '#9ca3af',
    border: '#e5e7eb',
    borderSoft: '#f3f4f6',
    primary: '#2563eb',
    primarySoft: '#eff6ff',
    primaryText: '#ffffff',
    danger: '#dc2626',
    warningBg: '#fff7ed',
    warningText: '#9a3412',
    successBg: '#ecfdf5',
    successText: '#047857',
    overlay: 'rgba(17,24,39,0.72)',
    statusBarStyle: 'dark' as const,
  },
  dark: {
    scheme: 'dark',
    background: '#0f1115',
    canvas: '#0b0d11',
    surface: '#171a21',
    surfaceMuted: '#1f2430',
    surfaceSoft: '#242a36',
    input: '#151922',
    text: '#f3f4f6',
    textMuted: '#a7b0c0',
    textSubtle: '#7b8494',
    border: '#303747',
    borderSoft: '#252b38',
    primary: '#60a5fa',
    primarySoft: 'rgba(96,165,250,0.16)',
    primaryText: '#08111f',
    danger: '#f87171',
    warningBg: 'rgba(251,146,60,0.16)',
    warningText: '#fdba74',
    successBg: 'rgba(52,211,153,0.14)',
    successText: '#6ee7b7',
    overlay: 'rgba(0,0,0,0.72)',
    statusBarStyle: 'light' as const,
  },
} as const;

export type AppPalette = (typeof AppPalettes)[keyof typeof AppPalettes];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
