import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function FloatingCreateButton() {
  const { user } = useAuth();

  const onPress = () => {
    if (!user) {
      router.push('/login?redirect=/(tabs)/create');
      return;
    }
    router.push('/(tabs)/home/create');
  };

  return (
    <TouchableOpacity style={styles.fab} onPress={onPress}>
      <Ionicons name="add" size={20} color="#fff" />
      <Text style={styles.text}>등록</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});