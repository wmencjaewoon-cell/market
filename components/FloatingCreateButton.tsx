import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { canCreateListing } from '../lib/guard';

function showCreateAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

export default function FloatingCreateButton() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);

  const onPress = async () => {
    if (checking) return;

    if (!user) {
      router.push('/login?redirect=/(tabs)/home/create');
      return;
    }

    setChecking(true);

    try {
      const guard = await canCreateListing();

      if (!guard.ok) {
        showCreateAlert('게시글 등록 제한', guard.reason || '게시글 등록이 제한되어 있습니다.');
        return;
      }

      router.push('/(tabs)/home/create');
    } finally {
      setChecking(false);
    }
  };

  return (
    <TouchableOpacity style={[styles.fab, checking && styles.fabDisabled]} onPress={onPress} disabled={checking}>
      <Ionicons name="add" size={20} color="#fff" />
      <Text style={styles.text}>등록</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    backgroundColor: '#166534',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabDisabled: {
    opacity: 0.65,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
