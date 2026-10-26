import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';
import { formatVideoDuration } from '../lib/mediaAttachments';

export default function VideoAttachment({ uri, name = '영상', duration, compact = false, onOpen }: {
  uri: string;
  name?: string;
  duration?: number | null;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const theme = useAppTheme();
  const opening = useRef(false);
  useFocusEffect(useCallback(() => { opening.current = false; }, []));
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${name} 재생`}
      style={[styles.preview, compact && styles.compact, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => {
        if (opening.current) return;
        opening.current = true;
        Keyboard.dismiss();
        onOpen?.();
        router.push({ pathname: '/media/video' as any, params: { uri, title: name } });
      }}
    >
      <Ionicons name="play-circle" size={compact ? 32 : 48} color={theme.text} />
      <View style={styles.label}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{compact ? '영상' : name}</Text>
        {duration ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatVideoDuration(duration)}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 130, minWidth: 160, padding: 16, gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8 },
  compact: { minHeight: 0, minWidth: 0, width: '100%', height: '100%', padding: 6, gap: 2 },
  label: { maxWidth: '100%', alignItems: 'center', gap: 2 },
  title: { fontSize: 14, fontWeight: '600' },
});
