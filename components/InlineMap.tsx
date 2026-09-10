// 인라인 지도 플랫폼 브리지: 웹은 텍스트/웹 구현, 네이티브는 react-native-maps를 사용한다.
import { Platform } from 'react-native';

export default function InlineMap(props: any) {
  if (Platform.OS === 'web') {
    const Comp = require('./InlineMap.web').default;
    return <Comp {...props} />;
  }

  const Comp = require('./InlineMap.native').default;
  return <Comp {...props} />;
}
