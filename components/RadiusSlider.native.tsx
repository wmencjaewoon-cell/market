// 네이티브 반경 슬라이더: 동네 반경 설정에서 @react-native-community/slider를 사용한다.
import Slider from '@react-native-community/slider';
import React from 'react';
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
  trackColor,
  disabled = false,
  onChangeEnd,
}: Props) {
  const theme = useAppTheme();
  return (
    <Slider
      style={{ width: '100%', height: 44 }}
      accessibilityLabel="표시 반경"
      accessibilityValue={{ min, max, now: value, text: `${value}km` }}
      disabled={disabled}
      minimumTrackTintColor={activeColor ?? theme.primary}
      maximumTrackTintColor={trackColor ?? theme.border}
      thumbTintColor={activeColor ?? theme.primary}
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={value}
      onSlidingComplete={onChangeEnd}
    />
  );
}
