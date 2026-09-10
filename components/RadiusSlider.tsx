// 반경 슬라이더 플랫폼 브리지: native/web 입력 방식을 분리한다.
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
