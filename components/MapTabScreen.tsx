// 지도탭 플랫폼 브리지: 네이티브 지도와 웹 카카오 지도 구현을 분리한다.
import React from 'react';
import { Platform } from 'react-native';

export default function MapTabScreen(props: any) {
  if (Platform.OS === 'web') {
    const WebScreen = require('./MapTabScreen.web').default;
    return <WebScreen {...props} />;
  }

  const NativeScreen = require('./MapTabScreen.native').default;
  return <NativeScreen {...props} />;
}
