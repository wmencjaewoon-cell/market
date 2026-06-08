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