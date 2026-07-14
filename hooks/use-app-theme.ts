import { AppPalettes } from '../contexts/theme';
import { useColorScheme } from './use-color-scheme';

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? AppPalettes.dark : AppPalettes.light;
}
