// 위치 선택 화면 플랫폼 브리지: Expo Router 라우트는 이 파일을 통해 native/web 구현을 고른다.
import React from 'react';
import { Platform } from 'react-native';

export default function MapPickerScreen(props: any) {
  if (Platform.OS === 'web') {
    const WebScreen = require('./MapPickerScreen.web').default;
    return <WebScreen {...props} />;
  }

  const NativeScreen = require('./MapPickerScreen.native').default;
  return <NativeScreen {...props} />;
}
