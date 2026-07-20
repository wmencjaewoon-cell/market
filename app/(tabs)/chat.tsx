import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { getUnreadCountByRoom } from '../../lib/chat';
import { supabase } from '../../lib/supabase';
import { useTabRefresh } from '../../lib/tabRefresh';

const tabs = ['전체', '판매', '나눔', '구해요'] as const;
type ChatFilterTab = (typeof tabs)[number];

type ChatRoomListItem = {
  id: string;
  listing_id: number | null;
  store_user_id?: string | null;
  created_at: string;
  muted?: boolean;
  unread_count?: number;
  listing: {
    id: number;
    title: string;
    category: 'trade' | 'share' | 'want';
    price_text: string | null;
    region: string | null;
    author_id: string;
    seller_name?: string | null;
    listing_images?: {
      id: number;
      image_path: string;
      sort_order: number | null;
    }[];
  } | null;
  members: {
    user_id: string;
  }[];
  target_user_id?: string | null;
  target_name?: string | null;
  latest_message: {
    id: string;
    message: string;
    created_at: string;
    sender_id: string;
  } | null;
};

function formatTimeAgo(dateString?: string) {
  if (!dateString) return '';

  const created = new Date(dateString).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - created) / 1000 / 60);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;

  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}개월 전`;
}

function showChatListAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function getChatPreviewText(message?: string | null) {
  if (!message) return '아직 메시지가 없습니다.';

  if (message.startsWith('📍 약속 장소')) {
    const addressLine = message
      .split('\n')
      .find((line) => line.trim().startsWith('주소:'));
    const address = addressLine?.replace(/^주소:\s*/, '').trim();

    return address ? `약속장소: ${address}` : '약속장소를 보냈습니다.';
  }

  if (message.startsWith('📍 거래 장소')) {
    return '약속장소를 보냈습니다.';
  }

  return message;
}

async function confirmBlockChatUser() {
  const message = '상대방을 차단할까요?\n차단한 사용자는 내정보에서 해제할 수 있습니다.';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(message);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('차단하기', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '차단', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function ChatScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [menuRoom, setMenuRoom] = useState<ChatRoomListItem | null>(null);
  const [selectedTab, setSelectedTab] = useState<ChatFilterTab>('전체');
  const [rooms, setRooms] = useState<ChatRoomListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const fetchSeqRef = useRef(0);

  const getRoomTargetUserId = (room: ChatRoomListItem) => {
    if (!user) return null;

    return (
      room.members.find((member) => member.user_id !== user.id)?.user_id ||
      (room.listing?.author_id !== user.id ? room.listing?.author_id : null)
    );
  };



  const fetchRooms = useCallback(async () => {
  if (!user?.id) {
    setRooms([]);
    return;
  }

  const fetchSeq = ++fetchSeqRef.current;

  try {
    setRefreshing(true);

    const { data: memberRows, error: memberError } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', user.id);

    if (memberError) {
      console.log('내 채팅방 멤버 조회 실패:', memberError);
      return;
    }

    const roomIds = (memberRows || []).map((row: any) => row.room_id);

    if (roomIds.length === 0) {
      setRooms([]);
      return;
    }

    const [settingResult, blockResult, roomResult] = await Promise.all([
      supabase
        .from('chat_room_settings')
        .select('room_id, muted')
        .eq('user_id', user.id)
        .in('room_id', roomIds),

      supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id),

      supabase
        .from('chat_rooms')
        .select(`
          id,
          listing_id,
          store_user_id,
          created_at,
          listings (
            id,
            title,
            category,
            price_text,
            region,
            author_id,
            profiles!listings_author_id_fkey (
              display_name
            ),
            listing_images (
              id,
              image_path,
              sort_order
            )
          ),
          chat_room_members (
            user_id
          ),
          chat_messages (
            id,
            message,
            created_at,
            sender_id
          )
        `)
        .in('id', roomIds)
        .order('created_at', { ascending: false })
        .order('created_at', {
          ascending: false,
          foreignTable: 'chat_messages',
        })
        .limit(1, {
          foreignTable: 'chat_messages',
        }),
    ]);

    if (fetchSeq !== fetchSeqRef.current) return;

    if (roomResult.error) {
      console.log('채팅방 조회 실패:', roomResult.error);
      return;
    }

    if (blockResult.error) {
      console.log('채팅 목록 차단 사용자 조회 실패:', blockResult.error);
    }

    const muteMap = new Map(
      (settingResult.data || []).map((row: any) => [row.room_id, row.muted])
    );

    const blockedIds = new Set(
      (blockResult.data || []).map((row: any) => row.blocked_id)
    );

    const roomRows = roomResult.data || [];

    const targetIds = Array.from(
      new Set(
        roomRows
          .map((room: any) => {
            const members = room.chat_room_members || [];

            return (
              members.find((member: any) => member.user_id !== user.id)?.user_id ||
              (room.listings?.author_id !== user.id ? room.listings?.author_id : null)
            );
          })
          .filter(Boolean)
      )
    ) as string[];

    const targetNameMap = new Map<string, string>();

    if (targetIds.length > 0) {
      const { data: targetProfiles, error: targetProfileError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', targetIds);

      if (targetProfileError) {
        console.log('채팅 상대 프로필 조회 실패:', targetProfileError);
      }

      (targetProfiles || []).forEach((profile: any) => {
        if (profile.id) {
          targetNameMap.set(profile.id, profile.display_name || '상대방');
        }
      });
    }

    const mapped: ChatRoomListItem[] = roomRows.map((room: any) => {
      const sellerProfile = Array.isArray(room.listings?.profiles)
        ? room.listings.profiles[0]
        : room.listings?.profiles;

      const members = room.chat_room_members || [];

      const targetUserId =
        members.find((member: any) => member.user_id !== user.id)?.user_id ||
        (room.listings?.author_id !== user.id ? room.listings?.author_id : null);

      const sortedImages = [...(room.listings?.listing_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );

      const latestMessage = Array.isArray(room.chat_messages)
        ? room.chat_messages[0] || null
        : null;

      return {
        id: room.id,
        listing_id: room.listing_id,
        store_user_id: room.store_user_id,
        created_at: room.created_at,
        muted: muteMap.get(room.id) ?? false,
        listing: room.listings
          ? {
              ...room.listings,
              seller_name: sellerProfile?.display_name || null,
              listing_images: sortedImages,
            }
          : null,
        members,
        target_user_id: targetUserId,
        target_name: targetUserId ? targetNameMap.get(targetUserId) || null : null,
        latest_message: latestMessage,
        unread_count: 0,
      };
    });

    mapped.sort((a, b) => {
      const aTime = a.latest_message?.created_at || a.created_at;
      const bTime = b.latest_message?.created_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    const visibleRooms = mapped.filter((room) => {
      const targetId = room.target_user_id;
      return !targetId || !blockedIds.has(targetId);
    });

    // 먼저 목록부터 빠르게 보여줌
    setRooms(visibleRooms);

    // 안읽은 수는 뒤에서 붙임
    const roomsWithUnread = await Promise.all(
      visibleRooms.map(async (room) => ({
        ...room,
        unread_count: await getUnreadCountByRoom(room.id),
      }))
    );

    if (fetchSeq === fetchSeqRef.current) {
      setRooms(roomsWithUnread);
    }
  } catch (e) {
    console.log('채팅방 목록 불러오기 실패:', e);
  } finally {
    if (fetchSeq === fetchSeqRef.current) {
      setRefreshing(false);
    }
  }
}, [user?.id]);

  useEffect(() => {
  if (!user?.id) return;

  supabase.getChannels().forEach((channel) => {
    if (channel.topic.includes(`chat-list-${user.id}`)) {
      supabase.removeChannel(channel);
    }
  });

  const channel = supabase
    .channel(`chat-list-${user.id}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
      },
      () => {
        void fetchRooms();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_message_reads',
      },
      () => {
        void fetchRooms();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id, fetchRooms]);

useEffect(() => {
  if (!user?.id) return;
  void fetchRooms();
}, [user?.id, fetchRooms]);

useFocusEffect(
  useCallback(() => {
    if (!user?.id) return;

    void fetchRooms();
  }, [user?.id, fetchRooms])
);

  useTabRefresh('chat', () => {
    void fetchRooms();
  });

  const filteredRooms = useMemo(() => {
    if (selectedTab === '전체') return rooms;

    const categoryMap: Record<Exclude<ChatFilterTab, '전체'>, 'trade' | 'share' | 'want'> = {
      판매: 'trade',
      나눔: 'share',
      구해요: 'want',
    };

    return rooms.filter((room) => room.listing?.category === categoryMap[selectedTab]);
  }, [rooms, selectedTab]);

  const getImageUrl = (room: ChatRoomListItem) => {
    const path = room.listing?.listing_images?.[0]?.image_path;
    if (!path) return null;

    const { data } = supabase.storage
      .from('listing-images')
      .getPublicUrl(path);

    return data.publicUrl;
  };

  const getOtherUserLabel = (room: ChatRoomListItem) => {
    return `상대방: ${room.target_name || '상대방'}`;
  };

  const getCategoryLabel = (category?: 'trade' | 'share' | 'want') => {
    if (category === 'trade') return '판매';
    if (category === 'share') return '나눔';
    if (category === 'want') return '구해요';
    return '';
  };

  const toggleMuteRoom = async (room: ChatRoomListItem) => {
  if (!user) return;

  const nextMuted = !room.muted;

  const { error } = await supabase.from('chat_room_settings').upsert(
    {
      room_id: room.id,
      user_id: user.id,
      muted: nextMuted,
    },
    { onConflict: 'room_id,user_id' }
  );

  if (error) {
    console.log('알림 설정 실패:', error);
    Alert.alert('오류', '알림 설정을 변경하지 못했습니다.');
    return;
  }

  setRooms((prev) =>
    prev.map((item) =>
      item.id === room.id ? { ...item, muted: nextMuted } : item
    )
  );

  setMenuRoom(null);
};

const openFraudHistory = async () => {
  setMenuRoom(null);
  await Linking.openURL('https://thecheat.co.kr/rb/?mod=_search');
};

const reportRoom = (room: ChatRoomListItem) => {
  setMenuRoom(null);

  const targetUserId = getRoomTargetUserId(room);

  router.push({
    pathname: '/report/create',
    params: {
      targetUserId: targetUserId || '',
      roomId: room.id,
      listingId: room.listing?.id ? String(room.listing.id) : '',
    },
  } as any);
};

const blockRoomUser = async (room: ChatRoomListItem) => {
  const targetUserId = getRoomTargetUserId(room);

  if (!user || !targetUserId) {
    setMenuRoom(null);
    showChatListAlert('차단하기', '차단할 상대를 찾을 수 없습니다.');
    return;
  }

  if (targetUserId === user.id) {
    setMenuRoom(null);
    showChatListAlert('차단하기', '본인은 차단할 수 없습니다.');
    return;
  }

  const ok = await confirmBlockChatUser();
  if (!ok) return;

  const { error } = await supabase.from('user_blocks').upsert(
    {
      blocker_id: user.id,
      blocked_id: targetUserId,
    },
    {
      onConflict: 'blocker_id,blocked_id',
    }
  );

  setMenuRoom(null);

  if (error) {
    console.log('채팅 목록 차단 실패:', error);
    showChatListAlert(
      '차단 실패',
      error.message.includes('user_blocks')
        ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
        : '차단하지 못했습니다.'
    );
    return;
  }

  setRooms((prev) => prev.filter((item) => item.id !== room.id));
  showChatListAlert('차단 완료', '상대방을 차단했습니다.');
};

const exitRoom = (room: ChatRoomListItem) => {
  setMenuRoom(null);

  Alert.alert('채팅방 나가기', '채팅방을 나가시겠어요?', [
    { text: '취소', style: 'cancel' },
    {
      text: '나가기',
      style: 'destructive',
      onPress: async () => {
        if (!user) return;

        const { error } = await supabase.from('chat_room_members').delete().match({
          room_id: room.id,
          user_id: user.id,
        });

        if (error) {
          console.log('채팅방 나가기 실패:', error);
          Alert.alert('오류', '채팅방을 나가지 못했습니다.');
          return;
        }

        setRooms((prev) => prev.filter((item) => item.id !== room.id));
      },
    },
  ]);
};

  if (!user) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>채팅</Text>
        <Text style={styles.emptyDesc}>로그인 후 채팅 목록을 볼 수 있어요.</Text>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/login' as any)}
        >
          <Text style={styles.loginBtnText}>로그인하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>채팅</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={fetchRooms}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {tabs.map((tab) => {
            const active = selectedTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setSelectedTab(tab)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Modal visible={!!menuRoom} transparent animationType="fade">
  <TouchableWithoutFeedback onPress={() => setMenuRoom(null)}>
    <View style={styles.modalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.menuBox}>
          {menuRoom ? (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => toggleMuteRoom(menuRoom)}
              >
                <Text style={styles.menuText}>
                  {menuRoom.muted ? '알림 켜기' : '알림 끄기'}
                </Text>
                {menuRoom.muted ? (
                  <Ionicons name="notifications-off-outline" size={18} color={theme.textMuted} />
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => reportRoom(menuRoom)}>
                <Text style={[styles.menuText, styles.warnText]}>신고하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => blockRoomUser(menuRoom)}>
                <Text style={[styles.menuText, styles.warnText]}>차단하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={openFraudHistory}>
                <Text style={styles.menuText}>사기 이력 조회하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => exitRoom(menuRoom)}>
                <Text style={[styles.menuText, styles.warnText]}>채팅방 나가기</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

        {filteredRooms.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="chatbubble-ellipses-outline" size={34} color={theme.textSubtle} />
            <Text style={styles.emptyTitle}>아직 채팅방이 없어요</Text>
            <Text style={styles.emptyDesc}>
              관심 있는 물건에 채팅을 보내면 여기에 표시됩니다.
            </Text>
          </View>
        ) : (
          <View style={styles.roomList}>
            {filteredRooms.map((room) => {
              const imageUrl = getImageUrl(room);

              return (
                <TouchableOpacity
                  key={room.id}
                  style={styles.roomCard}
                  onPress={() => router.push(`/chat/${room.id}` as any)}
                >
                  <View style={styles.thumbWrap}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.thumb} />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <Ionicons name="image-outline" size={22} color={theme.textSubtle} />
                      </View>
                    )}
                  </View>

                  <View style={styles.roomInfo}>
                    <View style={styles.topRow}>
                      <View style={styles.topLeft}>
                        <Text style={styles.roomTitle} numberOfLines={1}>
                          {room.listing?.title ||
                            (room.store_user_id
                              ? `${room.target_name || '가게'} 문의`
                              : '삭제된 게시글')}
                        </Text>
                        {room.listing?.category ? (
                          <Text style={styles.categoryBadge}>
                            {getCategoryLabel(room.listing.category)}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.roomRight}>
  {room.muted ? (
    <Ionicons name="notifications-off-outline" size={16} color={theme.textSubtle} />
  ) : null}

  <Text style={styles.timeText}>
    {formatTimeAgo(room.latest_message?.created_at || room.created_at)}
  </Text>
  {room.unread_count && room.unread_count > 0 ? (
  <View style={styles.unreadBadge}>
    <Text style={styles.unreadBadgeText}>
      {room.unread_count > 99 ? '99+' : room.unread_count}
    </Text>
  </View>
) : null}

  <TouchableOpacity
    style={styles.moreBtn}
    onPress={(e) => {
      e.stopPropagation();
      setMenuRoom(room);
    }}
  >
    <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
  </TouchableOpacity>
</View>
                    </View>

                    <Text style={styles.partnerText} numberOfLines={1}>
                      {getOtherUserLabel(room)}
                    </Text>

                    <Text style={styles.messageText} numberOfLines={1}>
                      {getChatPreviewText(room.latest_message?.message)}
                    </Text>

                    <View style={styles.bottomRow}>
                      <Text style={styles.regionText} numberOfLines={1}>
                        {room.listing?.region || ''}
                      </Text>

                      <Text style={styles.priceText} numberOfLines={1}>
                        {room.listing?.price_text || '가격 문의'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
  },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: theme.background,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.text,
  },

  content: {
    paddingBottom: 30,
  },

  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },

  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },

  roomRight: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

moreBtn: {
  width: 28,
  height: 28,
  alignItems: 'center',
  justifyContent: 'center',
},

modalOverlay: {
  flex: 1,
  backgroundColor: theme.overlay,
  justifyContent: 'flex-end',
  padding: 16,
},

menuBox: {
  backgroundColor: theme.surface,
  borderRadius: 18,
  paddingVertical: 8,
},

menuItem: {
  paddingHorizontal: 18,
  paddingVertical: 15,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},

menuText: {
  fontSize: 15,
  fontWeight: '700',
  color: theme.text,
},

warnText: {
  color: theme.danger,
},

  tabBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },

  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textMuted,
  },

  tabTextActive: {
    color: theme.primaryText,
  },

  roomList: {
    paddingHorizontal: 16,
    gap: 12,
  },

  roomCard: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSoft,
  },

  unreadBadge: {
  minWidth: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: theme.danger,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 6,
},

unreadBadgeText: {
  color: theme.primaryText,
  fontSize: 11,
  fontWeight: '900',
},

  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSoft,
  },

  thumb: {
    width: '100%',
    height: '100%',
  },

  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roomInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
  },

  topLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  roomTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.text,
    flexShrink: 1,
  },

  categoryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },

  timeText: {
    fontSize: 12,
    color: theme.textSubtle,
  },

  partnerText: {
    marginTop: 4,
    fontSize: 13,
    color: theme.textMuted,
  },

  messageText: {
    marginTop: 6,
    fontSize: 14,
    color: theme.textMuted,
  },

  bottomRow: {
    marginTop: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },

  regionText: {
    fontSize: 12,
    color: theme.textSubtle,
    flex: 1,
  },

  priceText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.text,
  },

  emptyBox: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
  },

  emptyDesc: {
    marginTop: 8,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  emptyWrap: {
    flex: 1,
    backgroundColor: theme.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loginBtn: {
    marginTop: 18,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },

  loginBtnText: {
    color: theme.primaryText,
    fontWeight: '800',
  },
});
}
