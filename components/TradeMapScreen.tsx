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
