import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmDeleteAccount() {
  const message =
    '회원탈퇴를 신청하면 3일 동안 복구할 수 있고, 그동안 같은 이메일이나 카카오 계정으로 새로 가입할 수 없습니다. 진행할까요?';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`회원탈퇴\n${message}`);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('회원탈퇴', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '탈퇴', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function DeleteAccountScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const deleteAccount = async () => {
    if (!user || loading) return;

    const ok = await confirmDeleteAccount();
    if (!ok) return;

    setLoading(true);

    try {
      const { error } = await supabase.rpc('request_current_user_deletion');

      if (error) {
        console.log('회원탈퇴 실패:', error);
        showAlert(
          '회원탈퇴 실패',
          error.message.includes('function')
            ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
            : error.message
        );
        return;
      }

      showAlert(
        '회원탈퇴 신청 완료',
        '3일 동안 로그인 후 탈퇴를 취소할 수 있습니다. 같은 이메일이나 카카오 계정으로는 바로 새로 가입할 수 없습니다.'
      );
      await supabase.auth.signOut();
      router.replace('/login' as any);
    } catch (error: any) {
      console.log('회원탈퇴 예외:', error);
      showAlert('회원탈퇴 실패', error?.message || '회원탈퇴 처리 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>회원탈퇴 전 확인해 주세요</Text>

        <Text style={styles.desc}>
          탈퇴 신청 후 3일 동안은 같은 계정으로 로그인해 탈퇴를 취소할 수 있습니다.
          복구 가능 기간에는 같은 이메일이나 카카오 계정으로 새로 가입할 수 없습니다.
          작성한 게시글, 채팅, 거래 기록, 신고 처리 기록은 서비스 운영과 분쟁 대응을
          위해 일부 보관될 수 있습니다.
        </Text>

        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>탈퇴 시 제한</Text>
          <Text style={styles.warningText}>3일 동안 복구 또는 취소할 수 있습니다.</Text>
          <Text style={styles.warningText}>진행 중인 거래가 있다면 먼저 정리해 주세요.</Text>
          <Text style={styles.warningText}>탈퇴 대기 중에는 같은 이메일/카카오 계정으로 재가입할 수 없습니다.</Text>
        </View>

        <TouchableOpacity
          style={[styles.deleteBtn, loading && styles.disabledBtn]}
          onPress={deleteAccount}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteText}>회원탈퇴</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
  },
  title: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  desc: {
    marginTop: 12,
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 24,
  },
  warningBox: {
    marginTop: 18,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
  },
  warningTitle: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
  },
  warningText: {
    color: '#7f1d1d',
    fontSize: 14,
    lineHeight: 22,
  },
  deleteBtn: {
    marginTop: 22,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.65,
  },
  deleteText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  cancelBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '800',
  },
});
