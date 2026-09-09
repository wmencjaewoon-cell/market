// 위치 상세 지도 플랫폼 브리지: 네이티브 지도와 웹 지도 화면을 연결한다.
import React from 'react';
import { Platform } from 'react-native';

export default function TradeMapScreen(props: any) {
  if (Platform.OS === 'web') {
    const WebScreen = require('./TradeMapScreen.web').default;
    return <WebScreen {...props} />;
  }

  const NativeScreen = require('./TradeMapScreen.native').default;
  return <NativeScreen {...props} />;
}
