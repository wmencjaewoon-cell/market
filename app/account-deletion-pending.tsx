import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type PendingProfile = {
  status: string | null;
  deletion_scheduled_at: string | null;
};

function showPendingAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function formatDeletionDate(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AccountDeletionPendingScreen() {
  const [profile, setProfile] = useState<PendingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.replace('/login' as any);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('status, deletion_scheduled_at')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.status !== 'deletion_pending') {
        router.replace('/(tabs)/home' as any);
        return;
      }

      setProfile(data as PendingProfile);
    } catch (e: any) {
      showPendingAlert('계정 상태 확인 실패', e?.message || '계정 상태를 확인하지 못했습니다.');
      router.replace('/login' as any);
    } finally {
      setLoading(false);
    }
  };

  const cancelDeletion = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);

      const { error } = await supabase.rpc('cancel_current_user_deletion');

      if (error) {
        showPendingAlert(
          '탈퇴 취소 실패',
          error.message.includes('function')
            ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
            : error.message.includes('grace period')
            ? '탈퇴 취소 가능 기간이 지나 복구할 수 없습니다.'
            : error.message
        );
        return;
      }

      router.replace('/(tabs)/home' as any);
    } catch (e: any) {
      showPendingAlert('탈퇴 취소 실패', e?.message || '탈퇴 취소 중 문제가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmAndSignOut = async () => {
    if (submitting) return;

    setSubmitting(true);
    await supabase.auth.signOut();
    router.replace('/login' as any);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>탈퇴 진행 중입니다</Text>
        <Text style={styles.desc}>
          탈퇴 대기 중에는 채팅, 게시글 작성 등 서비스 이용이 제한됩니다. 탈퇴 요청 후
          3일 동안은 계정을 복구할 수 있습니다.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>복구 가능 기한</Text>
          <Text style={styles.infoValue}>
            {formatDeletionDate(profile?.deletion_scheduled_at) || '확인 필요'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.disabledBtn]}
          onPress={cancelDeletion}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>탈퇴 취소</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={confirmAndSignOut}
          disabled={submitting}
        >
          <Text style={styles.secondaryText}>확인</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 18,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  title: {
    color: '#991b1b',
    fontSize: 22,
    fontWeight: '900',
  },
  desc: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 24,
  },
  infoBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  infoLabel: {
    color: '#7f1d1d',
    fontSize: 13,
    fontWeight: '800',
  },
  infoValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  primaryBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.65,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '900',
  },
});
