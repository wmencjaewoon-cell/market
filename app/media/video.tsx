import { requireOptionalNativeModule } from 'expo-modules-core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

export default function VideoScreen() {
  const params = useLocalSearchParams<{ uri?: string; title?: string }>();
  const uri = typeof params.uri === 'string' ? params.uri : '';
  const [Player, setPlayer] = useState<ComponentType<{ uri: string }> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!/^(https?:\/\/|file:\/\/|content:\/\/|blob:)/i.test(uri)) {
      setError('영상 주소를 확인할 수 없습니다.');
      return;
    }
    // OTA만 적용된 구버전 앱에서도 화면 진입 시 네이티브 모듈 누락으로 종료되지 않게 한다.
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoVideo')) {
      setError('영상 재생 기능이 포함된 최신 앱으로 업데이트해 주세요. 개발 중이라면 새 네이티브 빌드가 필요합니다.');
      return;
    }
    import('../../components/AttachmentVideoPlayer')
      .then((module) => { if (active) setPlayer(() => module.default); })
      .catch(() => { if (active) setError('영상 재생 기능을 불러오지 못했습니다. 앱을 업데이트해 주세요.'); });
    return () => { active = false; };
  }, [uri]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: typeof params.title === 'string' ? params.title : '영상', headerShown: true }} />
      {error ? <Text style={styles.error}>{error}</Text> : Player
        ? <Player key={uri} uri={uri} />
        : <ActivityIndicator style={styles.loading} color="#fff" size="large" />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  error: { color: '#fff', padding: 24, lineHeight: 24 },
  loading: { flex: 1 },
});
