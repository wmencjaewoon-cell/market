import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getProfileImageUrl } from '../../lib/profileImage';
import { supabase } from '../../lib/supabase';

type BlockRow = {
  blocked_id: string;
  created_at: string;
};

type BlockedUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
  blocked_at: string;
};

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmUnblock(name: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`${name}님의 차단을 해제할까요?`);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('차단 해제', `${name}님의 차단을 해제할까요?`, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '해제', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatBlockedDate(dateString?: string) {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlockedUsersScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: blockRows, error: blockError } = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    if (blockError) {
      console.log('차단 목록 조회 실패:', blockError);
      showAlert('차단 목록', '차단한 사용자를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    const blocks = (blockRows || []) as BlockRow[];
    const blockedIds = blocks.map((item) => item.blocked_id);

    if (blockedIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, email, avatar_path, avatar_url, user_type')
      .in('id', blockedIds);

    if (profileError) {
      console.log('차단 사용자 프로필 조회 실패:', profileError);
      showAlert('차단 목록', '사용자 정보를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

    setItems(
      blocks.map((block) => {
        const profile: any = profileMap.get(block.blocked_id);

        return {
          id: block.blocked_id,
          display_name: profile?.display_name || null,
          email: profile?.email || null,
          avatar_path: profile?.avatar_path || null,
          avatar_url: profile?.avatar_url || null,
          user_type: profile?.user_type || null,
          blocked_at: block.created_at,
        };
      })
    );
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void fetchBlockedUsers();
    }, [fetchBlockedUsers])
  );

  const unblockUser = async (target: BlockedUser) => {
    if (!user) return;

    const name = target.display_name || target.email || '사용자';
    const ok = await confirmUnblock(name);
    if (!ok) return;

    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', target.id);

    if (error) {
      console.log('차단 해제 실패:', error);
      showAlert('차단 해제', '차단을 해제하지 못했습니다.');
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== target.id));
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>차단한 사용자</Text>
          <Text style={styles.desc}>
            차단을 해제하면 해당 사용자와 다시 채팅하거나 거래할 수 있습니다.
          </Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>차단한 사용자가 없습니다.</Text>}
      renderItem={({ item }) => {
        const avatarUrl = getProfileImageUrl(item.avatar_path || item.avatar_url);
        const name = item.display_name || item.email || '알 수 없는 사용자';

        return (
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{name.slice(0, 1)}</Text>
              )}
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.userMeta}>
                {item.user_type === 'store' ? '가게' : '개인'} · {formatBlockedDate(item.blocked_at)}
              </Text>
            </View>

            <TouchableOpacity style={styles.unblockBtn} onPress={() => unblockUser(item)}>
              <Text style={styles.unblockText}>해제</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    padding: 18,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  desc: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 21,
  },
  empty: {
    marginTop: 60,
    color: '#9ca3af',
    textAlign: 'center',
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  userMeta: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 13,
  },
  unblockBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unblockText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },
});
