import Slider from '@react-native-community/slider';
import React from 'react';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChangeEnd: (value: number) => void;
};

export default function RadiusSlider({
  value,
  min = 1,
  max = 20,
  step = 1,
  onChangeEnd,
}: Props) {
  return (
    <Slider
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={value}
      onSlidingComplete={onChangeEnd}
    />
  );
}