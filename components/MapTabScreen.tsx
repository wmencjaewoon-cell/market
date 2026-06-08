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