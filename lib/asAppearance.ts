import { type AppPalette } from '../contexts/theme';

// 시안 색상은 AS 화면에만 적용한다. 장터/가게 관리의 기존 테마는 변경하지 않는다.
export function getAsPalette(base: AppPalette) {
  const dark = base.scheme === 'dark';
  return {
    ...base,
    background: dark ? '#101114' : '#f9f9ff',
    surface: dark ? '#1c1e24' : '#ffffff',
    surfaceSoft: dark ? '#252833' : '#e7eeff',
    surfaceMuted: dark ? '#20232b' : '#f0f3ff',
    input: dark ? '#1c1e24' : '#ffffff',
    text: dark ? '#f4f5fa' : '#111c2d',
    textMuted: dark ? '#b9bdc9' : '#434655',
    textSubtle: dark ? '#9ca3b3' : '#747686',
    border: dark ? '#353946' : '#e0e4f0',
    primary: dark ? '#b7c4ff' : '#0037b0',
    primarySoft: dark ? '#252f4b' : '#e7eeff',
    primaryText: dark ? '#001551' : '#ffffff',
    action: '#0037b0',
    accent: '#fd761a',
    accentText: dark ? '#ffb690' : '#9d4300',
    accentSoft: dark ? '#35271f' : '#ffdbca',
    positive: dark ? '#6ffbbe' : '#006a48',
    positiveSoft: dark ? '#18382d' : '#d8f9e9',
  };
}

export type AsPalette = ReturnType<typeof getAsPalette>;
