import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const savePassword = async () => {
    if (!user || saving) return;

    const nextPassword = password.trim();

    if (nextPassword.length < 8) {
      setMessage('비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }

    if (nextPassword !== confirmPassword.trim()) {
      setMessage('비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');

      const { error } = await supabase.auth.updateUser({
        password: nextPassword,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setPassword('');
      setConfirmPassword('');
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '비밀번호 변경' }} />

      <View style={styles.content}>
        <Text style={styles.title}>비밀번호 변경</Text>
        <Text style={styles.desc}>
          임시로 발급된 직원 계정과 일반 가입 계정 모두 여기서 새 비밀번호로 변경할 수 있습니다.
        </Text>

        {!user ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>로그인이 필요합니다</Text>
            <Text style={styles.noticeText}>비밀번호를 변경하려면 먼저 로그인해 주세요.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>새 비밀번호</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="8자 이상 입력"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>새 비밀번호 확인</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="한 번 더 입력"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={savePassword}
              disabled={saving}
            >
              <Text style={styles.saveText}>{saving ? '변경 중...' : '비밀번호 변경'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  desc: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  label: { color: '#111827', fontSize: 14, fontWeight: '900', marginTop: 6 },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 15,
  },
  message: { color: '#dc2626', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  saveBtn: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  noticeBox: {
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
