// 웹 반경 슬라이더 fallback: DOM input range를 React Native Web 안에서 사용한다.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  activeColor?: string;
  trackColor?: string;
  disabled?: boolean;
  onChangeEnd: (value: number) => void;
};

export default function RadiusSlider({
  value,
  min = 1,
  max = 20,
  step = 1,
  activeColor,
  disabled = false,
  onChangeEnd,
}: Props) {
  const theme = useAppTheme();
  return (
    <View style={styles.wrap}>
      <input
        type="range"
        aria-label="표시 반경"
        aria-valuetext={`${value}km`}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChangeEnd(Number(e.currentTarget.value))}
        style={{ width: '100%', height: 44, margin: 0, accentColor: activeColor ?? theme.primary, colorScheme: theme.scheme }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingVertical: 6,
  },
});
