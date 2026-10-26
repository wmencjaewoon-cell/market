import { useEvent } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AttachmentVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [retryFailed, setRetryFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    return () => { player.pause(); };
  }, [player]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => subscription.remove();
  }, [player]);

  return (
    <View style={styles.screen}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls allowsFullscreen />
      {status === 'loading' ? <ActivityIndicator style={styles.loading} color="#fff" size="large" pointerEvents="none" /> : null}
      {status === 'error' || retryFailed ? (
        <View style={styles.error}>
          <Text style={styles.text}>영상을 재생하지 못했습니다. 연결 상태나 영상 형식을 확인해 주세요.</Text>
          <TouchableOpacity style={styles.retry} onPress={async () => {
            setRetryFailed(false);
            try { await player.replaceAsync(uri); } catch { setRetryFailed(true); }
          }}>
            <Text style={styles.text}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, width: '100%' },
  loading: { position: 'absolute', alignSelf: 'center', top: '45%' },
  error: { position: 'absolute', left: 20, right: 20, top: '35%', padding: 20, backgroundColor: '#171717', gap: 16, alignItems: 'center', borderRadius: 8 },
  text: { color: '#fff', textAlign: 'center', fontSize: 14 },
  retry: { backgroundColor: '#166534', padding: 12, borderRadius: 8 },
});
