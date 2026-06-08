import { Platform } from 'react-native';

export default function InlineMap(props: any) {
  if (Platform.OS === 'web') {
    const Comp = require('./InlineMap.web').default;
    return <Comp {...props} />;
  }

  const Comp = require('./InlineMap.native').default;
  return <Comp {...props} />;
}