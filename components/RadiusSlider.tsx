import React from 'react';
import { Platform } from 'react-native';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChangeEnd: (value: number) => void;
};

export default function RadiusSlider(props: Props) {
  if (Platform.OS === 'web') {
    const WebSlider = require('./RadiusSlider.web').default;
    return <WebSlider {...props} />;
  }

  const NativeSlider = require('./RadiusSlider.native').default;
  return <NativeSlider {...props} />;
}