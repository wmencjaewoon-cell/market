// 현장 초대 링크 화면: 외부 협력업체가 토큰으로 현장 참여를 수락하는 진입점이다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { supabase } from '../../lib/supabase';

export default function ProjectInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const inviteToken = typeof token === 'string' ? token : '';

  useEffect(() => {
    const acceptInvite = async () => {
      if (!user || !inviteToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage('');

      const { data, error } = await supabase.rpc('accept_project_member_invite', {
        p_invite_token: inviteToken,
      });

      if (error || !data?.project_id) {
        setErrorMessage(error?.message || '초대 링크를 확인하지 못했습니다.');
        setLoading(false);
        return;
      }

      router.replace(`/store/projects?projectId=${data.project_id}` as any);
    };

    void acceptInvite();
  }, [inviteToken, user]);

  if (!user) {
    return <Redirect href={`/login?redirect=/project-invite/${inviteToken}` as any} />;
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '현장 초대' }} />
      <View style={styles.box}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.title}>초대 확인 중</Text>
            <Text style={styles.desc}>현장 참여 권한을 연결하고 있습니다.</Text>
          </>
        ) : errorMessage ? (
          <>
            <View style={styles.iconBox}>
              <Ionicons name="alert-circle-outline" size={28} color={theme.danger} />
            </View>
            <Text style={styles.title}>초대 확인 실패</Text>
            <Text style={styles.desc}>{errorMessage}</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)/home' as any)}>
              <Text style={styles.buttonText}>홈으로 이동</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.canvas,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    box: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 22,
      alignItems: 'center',
      gap: 10,
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: theme.text, fontSize: 18, fontWeight: '900' },
    desc: { color: theme.textMuted, fontSize: 13, fontWeight: '700', lineHeight: 19, textAlign: 'center' },
    button: {
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    buttonText: { color: theme.primaryText, fontSize: 14, fontWeight: '900' },
  });
}
