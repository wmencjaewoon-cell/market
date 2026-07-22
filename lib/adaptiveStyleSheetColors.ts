import {
  Appearance,
  DynamicColorIOS,
  Platform,
  StyleSheet,
  type ColorValue,
} from 'react-native';

type ColorPair = {
  light: string;
  dark: string;
};

const colorPairs = {
  background: { light: '#ffffff', dark: '#0f1115' },
  canvas: { light: '#f9fafb', dark: '#0b0d11' },
  surface: { light: '#ffffff', dark: '#171a21' },
  surfaceMuted: { light: '#f9fafb', dark: '#1f2430' },
  surfaceSoft: { light: '#f3f4f6', dark: '#242a36' },
  input: { light: '#ffffff', dark: '#151922' },
  text: { light: '#111827', dark: '#f3f4f6' },
  textMuted: { light: '#6b7280', dark: '#a7b0c0' },
  textSoft: { light: '#374151', dark: '#a7b0c0' },
  textSubtle: { light: '#9ca3af', dark: '#7b8494' },
  border: { light: '#e5e7eb', dark: '#303747' },
  borderSoft: { light: '#f3f4f6', dark: '#252b38' },
  primary: { light: '#166534', dark: '#86efac' },
  primaryStrong: { light: '#14532d', dark: '#bbf7d0' },
  primarySoft: { light: '#ecfdf5', dark: 'rgba(134,239,172,0.16)' },
  danger: { light: '#dc2626', dark: '#f87171' },
  dangerSoft: { light: '#fff7f7', dark: '#2a1719' },
  redSoft: { light: '#fef2f2', dark: '#2a1719' },
  warning: { light: '#fff7ed', dark: '#271a10' },
  warningSoft: { light: '#fffbeb', dark: '#2a2110' },
  warningText: { light: '#9a3412', dark: '#fdba74' },
  orangeText: { light: '#b45309', dark: '#fdba74' },
  successBg: { light: '#ecfdf5', dark: 'rgba(52,211,153,0.14)' },
  successText: { light: '#047857', dark: '#6ee7b7' },
  greenText: { light: '#15803d', dark: '#6ee7b7' },
  greenBorder: { light: '#bbf7d0', dark: 'rgba(52,211,153,0.36)' },
  goldBorder: { light: '#fde68a', dark: 'rgba(251,191,36,0.45)' },
  purpleSoft: { light: '#f5f3ff', dark: 'rgba(167,139,250,0.16)' },
  purpleText: { light: '#7c3aed', dark: '#c4b5fd' },
  purpleBorder: { light: '#ddd6fe', dark: 'rgba(167,139,250,0.38)' },
  redBorder: { light: '#f76c6cff', dark: '#fca5a5' },
  cyanText: { light: '#07cce2ff', dark: '#67e8f9' },
  cyanBorder: { light: '#32c8ffff', dark: '#67e8f9' },
} satisfies Record<string, ColorPair>;

const backgroundColors: Record<string, keyof typeof colorPairs> = {
  '#fff': 'surface',
  '#ffffff': 'surface',
  '#f5f6f8': 'background',
  '#f6f7f9': 'surfaceSoft',
  '#f9fafb': 'surfaceMuted',
  '#f0f1f3': 'borderSoft',
  '#f3f4f6': 'surfaceSoft',
  '#eff6ff': 'primarySoft',
  '#ecfdf5': 'successBg',
  '#f5f3ff': 'purpleSoft',
  '#fef2f2': 'redSoft',
  '#fff7ed': 'warning',
  '#fffbeb': 'warningSoft',
  '#fff7f7': 'dangerSoft',
  'rgba(255,255,255,0.97)': 'surface',
  'rgba(255,255,255,0.96)': 'surface',
  'rgba(255,255,255,0.95)': 'surface',
  'rgba(255,255,255,0.86)': 'surface',
  'rgba(255,255,255,0.84)': 'surface',
  'rgba(255,255,255,0.74)': 'surfaceMuted',
};

const textColors: Record<string, keyof typeof colorPairs> = {
  '#000': 'text',
  '#111827': 'text',
  '#1f2937': 'text',
  '#374151': 'textSoft',
  '#4b5563': 'textMuted',
  '#6b7280': 'textMuted',
  '#9ca3af': 'textSubtle',
  '#d1d5db': 'textSubtle',
  '#2563eb': 'primary',
  '#1d4ed8': 'primaryStrong',
  '#dc2626': 'danger',
  '#047857': 'successText',
  '#15803d': 'greenText',
  '#9a3412': 'warningText',
  '#b45309': 'orangeText',
  '#7c3aed': 'purpleText',
  '#07cce2ff': 'cyanText',
};

const borderColors: Record<string, keyof typeof colorPairs> = {
  '#e5e7eb': 'border',
  '#f3f4f6': 'borderSoft',
  '#d1d5db': 'border',
  '#bfdbfe': 'primarySoft',
  '#dbeafe': 'primarySoft',
  '#bbf7d0': 'greenBorder',
  '#fde68a': 'goldBorder',
  '#ddd6fe': 'purpleBorder',
  '#f76c6cff': 'redBorder',
  '#32c8ffff': 'cyanBorder',
};

let installed = false;

function normalizeColor(value: string) {
  return value.trim().toLowerCase();
}

function adaptiveColor(pair: ColorPair): ColorValue {
  if (Platform.OS === 'ios') {
    return DynamicColorIOS(pair);
  }

  const scheme = Appearance.getColorScheme();
  return scheme === 'dark' ? pair.dark : pair.light;
}

function mapColorValue(key: string, value: string): ColorValue | string {
  const normalized = normalizeColor(value);

  if (key === 'backgroundColor') {
    const mapped = backgroundColors[normalized];
    return mapped ? adaptiveColor(colorPairs[mapped]) : value;
  }

  if (key === 'color') {
    const mapped = textColors[normalized];
    return mapped ? adaptiveColor(colorPairs[mapped]) : value;
  }

  if (key.endsWith('Color')) {
    const mapped = borderColors[normalized] || textColors[normalized];
    return mapped ? adaptiveColor(colorPairs[mapped]) : value;
  }

  return value;
}

function mapStyleValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    return mapColorValue(key, value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => mapStyleValue(key, entry));
  }

  if (value && typeof value === 'object') {
    return mapStyleObject(value as Record<string, unknown>);
  }

  return value;
}

function mapStyleObject(style: Record<string, unknown>) {
  const nextStyle: Record<string, unknown> = {};

  Object.entries(style).forEach(([key, value]) => {
    nextStyle[key] = mapStyleValue(key, value);
  });

  return nextStyle;
}

export function installAdaptiveStyleSheetColors() {
  if (installed) return;
  installed = true;

  const originalCreate = StyleSheet.create.bind(StyleSheet);

  StyleSheet.create = ((styles: Record<string, unknown>) => {
    const nextStyles: Record<string, unknown> = {};

    Object.entries(styles).forEach(([key, value]) => {
      nextStyles[key] =
        value && typeof value === 'object'
          ? mapStyleObject(value as Record<string, unknown>)
          : value;
    });

    return originalCreate(nextStyles as any);
  }) as typeof StyleSheet.create;
}
