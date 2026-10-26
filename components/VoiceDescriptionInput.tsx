import { Platform, Text, View } from 'react-native';

export type VoiceDescriptionInputProps = {
  value: string;
  disabled?: boolean;
  onChangeText: (value: string) => void;
};

export default function VoiceDescriptionInput(props: VoiceDescriptionInputProps) {
  try {
    const Component = Platform.OS === 'web'
      // Platform bridge keeps the native module out of unsupported web/Expo Go bundles.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ? require('./VoiceDescriptionInput.web').default
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      : require('./VoiceDescriptionInput.native').default;
    return <Component {...props} />;
  } catch {
    return <View><Text accessibilityRole="alert">이 빌드에서는 음성 인식을 사용할 수 없습니다. 텍스트로 입력해 주세요.</Text></View>;
  }
}
