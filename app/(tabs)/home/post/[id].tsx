import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { getProfileImageUrl } from '../../../../lib/profileImage';
//import ImageViewing from 'react-native-image-viewing';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ContactQrModal from '../../../../components/ContactQrModal';
import InlineMap from '../../../../components/InlineMap';
import { useAuth } from '../../../../contexts/AuthContext';
import { getOrCreateRoom } from '../../../../lib/chat';
import { canChatToListing } from '../../../../lib/chat_guard';
import { canUseApp } from '../../../../lib/guard';
import { checkProhibitedContent } from '../../../../lib/prohibited';
import { REPORT_REASONS } from '../../../../lib/reportReasons';
import {
  getSellerLevel,
  getSellerLevelStyle,
  getSellerLevelTitle,
} from '../../../../lib/sellerLevel';
import { supabase } from '../../../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HEADER_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const SIMILAR_STOP_WORDS = new Set([
  '판매',
  '나눔',
  '구함',
  '구해요',
  '무료',
  '가격',
  '문의',
  '거래',
  '자재',
  '인테리어',
  '가능',
  '오늘',
  '급구',
  '급매',
  '있어요',
  '합니다',
  '드립니다',
  '주세요',
]);

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
  return `${diffDay}일 전`;
}
function getTradeStatusLabel(status?: string, category?: string) {
  const isShare = category === 'share';
  if (status === 'hidden') return '숨김';
  if (status === 'reserved') return '예약중';
  if (status === 'done') return isShare ? '나눔완료' : '거래완료';
  return isShare ? '나눔중' : '거래중';
}

function getTradeStatusStyle(status?: string) {
  if (status === 'hidden') return styles.hiddenStatusBadge;
  if (status === 'reserved') return styles.reservedStatusBadge;
  if (status === 'done') return styles.soldStatusBadge;
  return styles.activeStatusBadge;
}

function getListingQuantityInfo(item?: any | null) {
  const total = Math.max(1, Number(item?.quantity_total ?? 1));
  const fallbackRemaining = item?.status === 'done' ? 0 : total;
  const remaining = Math.max(0, Number(item?.quantity_remaining ?? fallbackRemaining));
  const sold = Math.max(0, Number(item?.quantity_sold ?? Math.max(0, total - remaining)));

  return {
    total,
    remaining,
    sold,
    isMultiQuantity: total > 1,
  };
}

function showPostAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function normalizeSimilarText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSimilarText(value?: string | null) {
  const normalized = normalizeSimilarText(value);

  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !SIMILAR_STOP_WORDS.has(token))
    )
  );
}

function getSimilarListingScore(source: any, candidate: any) {
  const sourceTitle = normalizeSimilarText(source?.title);
  const sourceDescription = normalizeSimilarText(source?.description);
  const candidateTitle = normalizeSimilarText(candidate?.title);
  const candidateDescription = normalizeSimilarText(candidate?.description);
  const sourceTitleTokens = tokenizeSimilarText(source?.title);
  const sourceDescriptionTokens = tokenizeSimilarText(source?.description);
  const sourceTokens = Array.from(new Set([...sourceTitleTokens, ...sourceDescriptionTokens]));

  if (sourceTokens.length === 0) return 0;

  let score = 0;

  sourceTokens.forEach((token) => {
    const inSourceTitle = sourceTitleTokens.includes(token);

    if (candidateTitle.includes(token)) {
      score += inSourceTitle ? 6 : 4;
    }

    if (candidateDescription.includes(token)) {
      score += inSourceTitle ? 3 : 2;
    }
  });

  tokenizeSimilarText(candidate?.title).forEach((token) => {
    if (sourceTitle.includes(token)) {
      score += 4;
    } else if (sourceDescription.includes(token)) {
      score += 2;
    }
  });

  tokenizeSimilarText(candidate?.description).forEach((token) => {
    if (sourceTitle.includes(token)) {
      score += 2;
    } else if (sourceDescription.includes(token)) {
      score += 1;
    }
  });

  return score;
}

async function confirmBlockAuthor(name: string) {
  const message = `${name}님을 차단할까요?\n차단한 사용자는 내정보에서 해제할 수 있습니다.`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(message);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('작성자 차단', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '차단', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function ZoomableImage({
  uri,
  onPrev,
  onNext,
}: {
  uri: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (Platform.OS === 'web') {
    return <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />;
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        translateX.value = savedX.value + e.translationX;
        translateY.value = savedY.value + e.translationY;
        return;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.05) {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }

      if (e.translationX < -60) {
        runOnJS(onNext)();
      }

      if (e.translationX > 60) {
        runOnJS(onPrev)();
      }
    });

  const composed = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(doubleTap, pan)
  );

  return (
  <GestureDetector gesture={composed}>
    <Animated.View collapsable={false} style={styles.zoomGestureBox}>
      <Animated.Image
        source={{ uri }}
        style={[styles.fullImage, animatedStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  </GestureDetector>
);
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();


  const [item, setItem] = useState<any | null>(null);
  const [similarItems, setSimilarItems] = useState<any[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const mainImageScrollRef = useRef<any>(null);

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [buyerModalOpen, setBuyerModalOpen] = useState(false);
  const [chatUsers, setChatUsers] = useState<any[]>([]);
  const [saleQuantityText, setSaleQuantityText] = useState('1');
  const [chatStarting, setChatStarting] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportContent, setReportContent] = useState('');

  useEffect(() => {
    if (!id) return;

    const init = async () => {
      const visible = await fetchItem();

      if (visible) {
        await increaseViewCount();
      }
    };

    init();
  }, [id]);

  const fetchItem = async () => {
    const listingId = Number(id);

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        profiles!listings_author_id_fkey (
          display_name,
          user_type,
          business_verified,
          phone,
          is_phone_public,
          avatar_path,
          trust_points,
          trust_level,
          seller_level_style,
          show_level_on_posts
        ),
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('id', listingId)
      .single();

    if (error) {
      console.log('게시글 조회 실패:', error);
      return false;
    }

    if (!data) return false;

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = user?.id ?? authData.user?.id;

    if (data.status === 'hidden' && data.author_id !== currentUserId) {
      showPostAlert('숨김 게시글', '작성자가 숨긴 게시글입니다.');
      router.replace('/(tabs)/home' as any);
      return false;
    }

    const sortedImages = [...(data.listing_images || [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    setItem({
      ...data,
      listing_images: sortedImages,
    });

    await Promise.all([
      fetchFavoriteCount(listingId),
      fetchChatCount(listingId),
      fetchLiked(listingId),
      fetchSimilar(data, listingId),
    ]);

    return true;
  };

  const isOwner = user?.id === item?.author_id;

  const increaseViewCount = async () => {
    const listingId = Number(id);

    if (!listingId) return;

    const { data, error } = await supabase.rpc('increment_listing_views', {
      listing_id: listingId,
    });

    if (error) {
      console.log('조회수 증가 실패:', error);
      return;
    }

    setItem((prev: any) =>
      prev
        ? {
            ...prev,
            views_count: typeof data === 'number' ? data : (prev.views_count ?? 0) + 1,
          }
          
        : prev
    );
  };

  const fetchFavoriteCount = async (listingId: number) => {
    const { count, error } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (error) {
      console.log('관심 수 조회 실패:', error);
      return;
    }

    setFavoriteCount(count ?? 0);
  };

  const goToSellerProfile = () => {
    if (!item?.author_id) return;
    router.push(`/(tabs)/home/user/${item.author_id}` as any);
  };

  const goToTradeMap = () => {
    if (item?.latitude == null || item?.longitude == null) return;

    router.push({
      pathname: '/trade-map',
      params: {
        lat: String(item.latitude),
        lng: String(item.longitude),
        place: item.detail_location || '',
        region: item.region || '',
      },
    } as any);
  };

  const fetchChatCount = async (listingId: number) => {
    const { count, error } = await supabase
      .from('chat_rooms')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (error) {
      console.log('채팅 수 조회 실패:', error);
      return;
    }

    setChatCount(count ?? 0);
  };

  const fetchLiked = async (listingId: number) => {
    if (!user) {
      setLiked(false);
      return;
    }

    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', user.id)
      .eq('listing_id', listingId)
      .maybeSingle();

    if (error) {
      console.log('좋아요 여부 조회 실패:', error);
      return;
    }

    setLiked(!!data);
  };

  const fetchSimilar = async (sourceItem: any, currentId: number) => {
    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        profiles!listings_author_id_fkey (
          display_name,
          user_type,
          business_verified,
          trust_points,
          trust_level,
          seller_level_style,
          show_level_on_posts
        ),
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('status', 'active')
      .eq('category', sourceItem.category)
      .neq('id', currentId)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      console.log('비슷한 물품 조회 실패:', error);
      return;
    }

    const scoredItems = (data || [])
      .map((candidate: any) => {
        const textScore = getSimilarListingScore(sourceItem, candidate);
        const regionBonus =
          textScore > 0 && sourceItem.region && candidate.region === sourceItem.region ? 2 : 0;

        return {
          item: candidate,
          score: textScore + regionBonus,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ item }) => ({
        ...item,
        listing_images: [...(item.listing_images || [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }));

    setSimilarItems(scoredItems);
  };

  

  const imageUrls = useMemo(() => {
  return (item?.listing_images || [])
    .map((image: any) => {
      if (!image.image_path) return null;

      const { data } = supabase.storage
        .from('listing-images')
        .getPublicUrl(image.image_path);

      return data.publicUrl;
    })
    .filter(Boolean);
}, [item?.listing_images]);

  const isVerifiedStore =
    item?.profiles?.user_type === 'store' && !!item?.profiles?.business_verified;
  const sellerType = isVerifiedStore ? 'store' : 'personal';
  const sellerName = item?.profiles?.display_name ?? '알 수 없음';
  const publicPhone = sellerType === 'store' ? item?.profiles?.phone : null;
  const sellerLevel = getSellerLevel(item?.profiles);
  const sellerLevelStyle = getSellerLevelStyle(item?.profiles, sellerLevel);
  const showSellerLevel = item?.profiles?.show_level_on_posts !== false;
  const appChatDeepLink = item ? `interiormarket://open-chat/${item.id}` : '';
  const quantityInfo = useMemo(() => getListingQuantityInfo(item), [item]);
  const isShareListing = item?.category === 'share';

//   const viewerImages = useMemo(() => {
//   return imageUrls.map((url: any) => ({
//     uri: url as string,
//   }));
// }, [imageUrls]);

const goPrevImage = () => {
  setSelectedImageIndex((prev) =>
    prev <= 0 ? imageUrls.length - 1 : prev - 1
  );
};

const goNextImage = () => {
  setSelectedImageIndex((prev) =>
    prev >= imageUrls.length - 1 ? 0 : prev + 1
  );
};

const handleMainImageScroll = (event: any) => {
  if (imageUrls.length === 0) return;

  const offsetX = Number(event.nativeEvent.contentOffset?.x ?? 0);
  const index = Math.round(offsetX / SCREEN_WIDTH);
  const nextIndex = Math.max(0, Math.min(index, imageUrls.length - 1));

  setSelectedImageIndex((prev) => (prev === nextIndex ? prev : nextIndex));
};

const goToMainImage = (index: number) => {
  const nextIndex = Math.max(0, Math.min(index, imageUrls.length - 1));
  setSelectedImageIndex(nextIndex);
  mainImageScrollRef.current?.scrollTo({
    x: nextIndex * SCREEN_WIDTH,
    y: 0,
    animated: true,
  });
};

useEffect(() => {
  if (imageUrls.length === 0) {
    setSelectedImageIndex(0);
    return;
  }

  if (selectedImageIndex >= imageUrls.length) {
    setSelectedImageIndex(0);
  }
}, [imageUrls.length, selectedImageIndex]);

  const handleChat = async () => {
  if (!item || chatStarting) return;

  console.log('채팅하기 클릭', {
    platform: Platform.OS,
    itemId: item.id,
    authorId: item.author_id,
    userId: user?.id,
  });

  if (Platform.OS === 'web') {
    console.log('웹이라 QR 모달 오픈');
    setQrOpen(true);
    return;
  }

  if (!user) {
    console.log('로그인 안됨 -> 로그인 페이지 이동');
    router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
    return;
  }

  try {
    setChatStarting(true);

    const guard = await canChatToListing(item, user.id);
    console.log('채팅 가능 여부:', guard);

    if (!guard.ok) {
      Alert.alert('채팅 제한', guard.reason || '채팅할 수 없습니다.');
      return;
    }

    const roomId = await getOrCreateRoom(item.id, item.author_id, user.id);
    console.log('생성/조회된 roomId:', roomId);

    if (!roomId) {
      Alert.alert('채팅 오류', '채팅방을 만들지 못했습니다.');
      return;
    }

    router.push(`/chat/${roomId}` as any);
  } catch (e: any) {
    console.log('채팅하기 실패:', e);
    Alert.alert('채팅 오류', e?.message || '채팅방으로 이동하지 못했습니다.');
  } finally {
    setChatStarting(false);
  }
};

  const handlePhone = async () => {
    if (!item) return;

    if (!user) {
      router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
      return;
    }

    if (!publicPhone) return;
    const phone = String(publicPhone).replace(/[^0-9]/g, '');
    if (!phone) return;

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (e) {
      console.log('전화 연결 실패:', e);
    }
  };

  const handleShare = async () => {
  if (!item) return;

  const deepLink = `interiormarket://post/${item.id}`;

  try {
    await Share.share({
      title: item.title,
      message: `${item.title}
${item.price_text || '가격 문의'}

자재마켓에서 확인하기
${deepLink}`,
      url: deepLink,
    });
  } catch (e) {
    console.log('공유 실패:', e);
  }
};

const handleEdit = () => {
  if (!item || !isOwner) return;

  router.push({
    pathname: '/(tabs)/home/post/edit/[id]',
    params: {
      id: String(item.id),
    },
  } as any);
};

  const handleReport = async () => {
    setMenuOpen(false);

    if (!item) return;

    if (!user) {
      router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
      return;
    }

    if (!item.author_id) {
      showPostAlert('신고하기', '신고할 작성자를 찾을 수 없습니다.');
      return;
    }

    if (item.author_id === user.id) {
      showPostAlert('신고하기', '본인 게시글은 신고할 수 없습니다.');
      return;
    }

    const guard = await canUseApp();

    if (!guard.ok) {
      showPostAlert('신고 제한', guard.reason || '현재 신고를 접수할 수 없습니다.');
      return;
    }

    setReportReason('');
    setReportContent('');
    setReportModalOpen(true);
  };

  const submitReport = async () => {
    if (!item || !user) return;

    if (!reportReason) {
      showPostAlert('신고 항목 선택', '신고 항목을 선택해 주세요.');
      return;
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      target_user_id: item.author_id,
      listing_id: item.id,
      reason: reportReason,
      content: reportContent.trim() || item.title || null,
    });

    if (error) {
      console.log('게시글 신고 실패:', error);
      showPostAlert(
        '신고 실패',
        error.message.includes('reports')
          ? 'Supabase SQL 설정이 필요합니다. report_restrictions.sql을 실행해 주세요.'
          : '신고를 접수하지 못했습니다.'
      );
      return;
    }

    setReportModalOpen(false);
    setReportReason('');
    setReportContent('');
    showPostAlert('신고 접수 완료', '신고가 접수되었습니다.');
  };

  const handleHidePost = async () => {
    setMenuOpen(false);

    if (!item) return;

    if (!user) {
      showPostAlert('게시글 숨기기', '로그인이 필요합니다.');
      router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
      return;
    }

    const guard = await canUseApp();

    if (!guard.ok) {
      showPostAlert('게시글 숨기기 제한', guard.reason || '현재 게시글 숨기기를 사용할 수 없습니다.');
      return;
    }

    const { error } = await supabase.from('hidden_listings').upsert(
      {
        user_id: user.id,
        listing_id: item.id,
      },
      {
        onConflict: 'user_id,listing_id',
      }
    );

    if (error) {
      console.log('게시글 숨기기 실패:', error);
      showPostAlert(
        '게시글 숨기기 실패',
        error.message.includes('hidden_listings')
          ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
          : '게시글을 숨기지 못했습니다.'
      );
      return;
    }

    router.replace('/(tabs)/home' as any);
  };

  const handleBlockAuthor = async () => {
    setMenuOpen(false);

    if (!item) return;

    if (!user) {
      showPostAlert('작성자 차단', '로그인이 필요합니다.');
      router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
      return;
    }

    if (!item.author_id) {
      showPostAlert('작성자 차단', '차단할 작성자를 찾을 수 없습니다.');
      return;
    }

    if (item.author_id === user.id) {
      showPostAlert('작성자 차단', '본인은 차단할 수 없습니다.');
      return;
    }

    const guard = await canUseApp();

    if (!guard.ok) {
      showPostAlert('작성자 차단 제한', guard.reason || '현재 작성자 차단을 사용할 수 없습니다.');
      return;
    }

    const ok = await confirmBlockAuthor(sellerName || '작성자');
    if (!ok) return;

    const { error } = await supabase.from('user_blocks').upsert(
      {
        blocker_id: user.id,
        blocked_id: item.author_id,
      },
      {
        onConflict: 'blocker_id,blocked_id',
      }
    );

    if (error) {
      console.log('작성자 차단 실패:', error);
      showPostAlert(
        '작성자 차단 실패',
        error.message.includes('user_blocks')
          ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
          : '차단하지 못했습니다.'
      );
      return;
    }

    showPostAlert('차단 완료', `${sellerName || '작성자'}님을 차단했습니다.`);
    router.replace('/(tabs)/home' as any);
  };

  const handleToggleLike = async () => {
    if (!item) return;

    if (!user) {
      router.push(`/login?redirect=/(tabs)/home/post/${item.id}` as any);
      return;
    }

    const guard = await canUseApp();

    if (!guard.ok) {
      showPostAlert('관심 등록 제한', guard.reason || '현재 관심 등록을 사용할 수 없습니다.');
      return;
    }

    if (liked) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', item.id);

      if (error) {
        console.log('좋아요 취소 실패:', error);
        return;
      }

      setLiked(false);
      setFavoriteCount((prev) => Math.max(0, prev - 1));
    } else {
      const { error } = await supabase.from('favorites').insert({
        user_id: user.id,
        listing_id: item.id,
      });

      if (error) {
        console.log('좋아요 추가 실패:', error);
        return;
      }

      setLiked(true);
      setFavoriteCount((prev) => prev + 1);
    }
  };

  const updateListingStatus = async (nextStatus: 'active' | 'reserved' | 'done') => {
  if (!item || !isOwner) return;

  if (nextStatus === 'done') {
    await fetchChatUsers();
    setSaleQuantityText('1');
    setStatusMenuOpen(false);
    setBuyerModalOpen(true);
    return;
  }

  if (getListingQuantityInfo(item).remaining < 1) {
    Alert.alert('재고 없음', '남은 수량이 0개입니다. 게시글 수정에서 남은 수량을 먼저 늘려 주세요.');
    return;
  }

  

  const { error } = await supabase
    .from('listings')
    .update({
      status: nextStatus,
      buyer_id: null,
      listing_hidden_previous_status: null,
    })
    .eq('id', item.id);

  if (error) {
    console.log('상태 변경 실패:', error);
    Alert.alert('오류', '상태를 변경하지 못했습니다.');
    return;
  }

  setItem((prev: any) =>
    prev ? { ...prev, status: nextStatus, buyer_id: null, listing_hidden_previous_status: null } : prev
  );

  setStatusMenuOpen(false);
};

const toggleListingVisibility = async () => {
  if (!item || !isOwner) return;

  const isHidden = item.status === 'hidden';
  const restoreStatus =
    item.listing_hidden_previous_status &&
    ['active', 'reserved', 'done'].includes(item.listing_hidden_previous_status)
      ? item.listing_hidden_previous_status
      : 'active';

  const nextValues = isHidden
    ? {
        status: restoreStatus,
        listing_hidden_previous_status: null,
      }
    : {
        status: 'hidden',
        listing_hidden_previous_status:
          item.status && item.status !== 'hidden' ? item.status : 'active',
      };

  const { error } = await supabase
    .from('listings')
    .update(nextValues)
    .eq('id', item.id)
    .eq('author_id', user?.id);

  if (error) {
    console.log(`${isHidden ? '숨김취소' : '숨김'} 실패:`, error);
    Alert.alert(
      '오류',
      error.message.includes('listing_hidden_previous_status')
        ? 'Supabase SQL 설정이 필요합니다. listing_owner_visibility.sql을 실행해 주세요.'
        : `${isHidden ? '숨김취소' : '숨김'} 처리에 실패했습니다.`
    );
    return;
  }

  setItem((prev: any) =>
    prev
      ? {
          ...prev,
          ...nextValues,
        }
      : prev
  );

  setStatusMenuOpen(false);
};

const fetchChatUsers = async () => {
  if (!item) return;

  const { data, error } = await supabase
    .from('chat_rooms')
    .select(`
      id,
      created_by,
      chat_room_members (
        user_id,
        profiles (
          display_name
        )
      )
    `)
    .eq('listing_id', item.id);

  console.log('chat_rooms data:', JSON.stringify(data, null, 2));

  if (error) {
    console.log('채팅 상대 조회 실패:', error);
    Alert.alert('오류', '채팅 상대를 불러오지 못했습니다.');
    return;
  }

  const users =
    data?.flatMap((room: any) => {
      const members = room.chat_room_members || [];

      const otherMembers = members.filter(
        (member: any) => member.user_id !== item.author_id
      );

      if (otherMembers.length > 0) {
        return otherMembers.map((member: any) => ({
          id: member.user_id,
          name: member.profiles?.display_name || '채팅 상대',
          roomId: room.id,
        }));
      }

      // 멤버 테이블이 깨져서 1명만 있을 때 임시 복구용 fallback
      if (room.created_by && room.created_by !== item.author_id) {
        return [
          {
            id: room.created_by,
            name: '채팅 상대',
            roomId: room.id,
          },
        ];
      }

      return [];
    }) || [];

  const uniqueUsers = Array.from(
    new Map(users.map((u: any) => [u.id, u])).values()
  );

  setChatUsers(uniqueUsers);
};

const completeDealWithBuyer = async (buyerId: string, roomId?: string | null) => {
  if (!item || !isOwner) return;

  const blockedKeyword = checkProhibitedContent(
    item.title,
    item.price_text,
    item.description,
    item.region
  );

  if (blockedKeyword) {
    Alert.alert(
      isShareListing ? '나눔 처리 차단' : '판매 처리 차단',
      `"${blockedKeyword}" 관련 판매금지 물품은 ${isShareListing ? '나눔완료' : '판매'} 처리할 수 없습니다.`
    );
    return;
  }

  const saleQuantity = Number(saleQuantityText);
  const { remaining } = getListingQuantityInfo(item);
  const quantityLabel = isShareListing ? '나눔 수량' : '판매 수량';

  if (!Number.isInteger(saleQuantity) || saleQuantity < 1) {
    Alert.alert(quantityLabel, `${isShareListing ? '나눔한' : '판매한'} 수량을 1개 이상 입력해 주세요.`);
    return;
  }

  if (saleQuantity > remaining) {
    Alert.alert(quantityLabel, `남은 수량은 ${remaining}개입니다.`);
    return;
  }

  const { data, error } = await supabase.rpc('complete_listing_sale', {
    p_listing_id: item.id,
    p_buyer_id: buyerId,
    p_quantity: saleQuantity,
    p_room_id: roomId ?? null,
  });

  if (error) {
    console.log(`${isShareListing ? '나눔완료' : '거래완료'} 실패:`, error);
    Alert.alert('오류', `${isShareListing ? '나눔완료' : '거래완료'} 처리에 실패했습니다.`);
    return;
  }

  setItem((prev: any) =>
    prev
      ? {
          ...prev,
          ...(data || {}),
          buyer_id: buyerId,
        }
      : prev
  );

  setBuyerModalOpen(false);

  let latestSaleQuery = supabase
    .from('listing_sales')
    .select('id')
    .eq('listing_id', item.id)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (roomId) {
    latestSaleQuery = latestSaleQuery.eq('room_id', roomId);
  }

  const { data: latestSale, error: latestSaleError } = await latestSaleQuery.maybeSingle();

  if (latestSaleError) {
    console.log('판매 기록 조회 실패:', latestSaleError);
  }

  router.push({
    pathname: '/review/create',
    params: {
      listingId: String(item.id),
      targetUserId: buyerId,
      ...(latestSale?.id ? { saleId: String(latestSale.id) } : {}),
    },
  } as any);
};

  const renderHeaderRight = () => {
    if (!item) return null;

    return (
      <View style={styles.headerRight}>
        {isOwner ? (
          <TouchableOpacity
            style={styles.headerBtn}
            hitSlop={HEADER_HIT_SLOP}
            activeOpacity={0.85}
            onPress={handleEdit}
          >
            <Ionicons name="create-outline" size={22} color="#111827" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.headerBtn}
          hitSlop={HEADER_HIT_SLOP}
          activeOpacity={0.85}
          onPress={handleShare}
        >
          <Ionicons name="share-social-outline" size={22} color="#111827" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerBtn}
          hitSlop={HEADER_HIT_SLOP}
          activeOpacity={0.85}
          onPress={() => setMenuOpen(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#111827" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderFloatingHeader = () => {
    return (
      <View
        style={[
          styles.floatingHeader,
          { top: Math.max(insets.top + 8, 12) },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.headerBtn}
          hitSlop={HEADER_HIT_SLOP}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>

        {renderHeaderRight()}
      </View>
    );
  };

  const renderActionBar = (style?: any) => (
    <View style={[styles.bottomBar, style]}>
      <TouchableOpacity style={styles.heartBtn} onPress={handleToggleLike}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={24}
          color={liked ? '#ef4444' : '#111827'}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chatBtn, chatStarting && styles.chatBtnDisabled]}
        onPress={handleChat}
        activeOpacity={0.85}
        disabled={chatStarting}
      >
        {chatStarting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.chatBtnText}>
            {Platform.OS === 'web' ? '앱으로 채팅하기' : '채팅하기'}
          </Text>
        )}
      </TouchableOpacity>

      {sellerType === 'store' && publicPhone ? (
        <TouchableOpacity style={styles.phoneBtn} onPress={handlePhone}>
          <Text style={styles.phoneBtnText}>전화하기</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (!item) {
    return (
      <>
        <Stack.Screen
          options={{
            title: '',
            headerShown: false,
          }}
        />
        {renderFloatingHeader()}
        <View style={styles.center}>
          <Text>불러오는 중...</Text>
        </View>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: '',
          headerShown: false,
        }}
      />
      {renderFloatingHeader()}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.imageWrap}>
  {imageUrls.length > 0 ? (
    <>
      <ScrollView
        ref={mainImageScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleMainImageScroll}
        onMomentumScrollEnd={handleMainImageScroll}
        scrollEventThrottle={16}
      >
        {imageUrls.map((url: any, index: number) => (
          <TouchableOpacity
            key={`${url}-${index}`}
            style={styles.mainImageTouch}
            activeOpacity={0.95}
            onPress={() => {
              setSelectedImageIndex(index);
              setImageViewerOpen(true);
            }}
          >
            <Image
              source={{ uri: url }}
              style={styles.mainImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.imageCountBadge}>
        <Text style={styles.imageCountText}>
          {selectedImageIndex + 1}/{imageUrls.length}
        </Text>
      </View>

      {imageUrls.length > 1 ? (
        <View style={styles.imageDots}>
          {imageUrls.map((_: any, index: number) => (
            <View
              key={`image-dot-${index}`}
              style={[
                styles.imageDot,
                selectedImageIndex === index && styles.imageDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}

      {Platform.OS === 'web' && imageUrls.length > 1 && selectedImageIndex > 0 ? (
        <TouchableOpacity
          style={[styles.imageNavBtn, styles.imageNavLeft]}
          activeOpacity={0.85}
          onPress={() => goToMainImage(selectedImageIndex - 1)}
        >
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </TouchableOpacity>
      ) : null}

      {Platform.OS === 'web' &&
      imageUrls.length > 1 &&
      selectedImageIndex < imageUrls.length - 1 ? (
        <TouchableOpacity
          style={[styles.imageNavBtn, styles.imageNavRight]}
          activeOpacity={0.85}
          onPress={() => goToMainImage(selectedImageIndex + 1)}
        >
          <Ionicons name="chevron-forward" size={28} color="#111827" />
        </TouchableOpacity>
      ) : null}
    </>
  ) : (
    <View style={styles.imagePlaceholder}>
      <Ionicons name="image-outline" size={54} color="#9ca3af" />
    </View>
  )}
</View>

        <TouchableOpacity
          style={[
            styles.sellerCard,
            showSellerLevel && {
              borderColor: sellerLevelStyle.borderColor,
              backgroundColor: sellerLevelStyle.backgroundColor,
            },
          ]}
          onPress={goToSellerProfile}
        >
  <View style={styles.sellerAvatar}>
    {item?.profiles?.avatar_path ? (
      <Image
  source={{
    uri: getProfileImageUrl(item.profiles.avatar_path) as string,
  }}
  style={styles.sellerAvatarImage}
/>
    ) : (
      <Ionicons name="person-outline" size={20} color="#6b7280" />
    )}
  </View>

  <View style={styles.sellerInfo}>
    <Text style={styles.sellerName}>{sellerName}</Text>
    <Text style={styles.sellerType}>
      {sellerType === 'store' ? '가게 판매자' : '개인 판매자'}
    </Text>
    <View style={styles.sellerDecorRow}>
      {isVerifiedStore ? (
        <Text style={styles.sellerVerifiedBadge}>가게인증 완료</Text>
      ) : null}
      {showSellerLevel ? (
        <Text
          style={[
            styles.sellerLevelBadge,
            {
              borderColor: sellerLevelStyle.borderColor,
              color: sellerLevelStyle.textColor,
            },
          ]}
        >
          LV.{sellerLevel} {getSellerLevelTitle(sellerLevel)}
        </Text>
      ) : null}
    </View>
  </View>

  <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
</TouchableOpacity>

        <View style={styles.badgesRow}>
          <Text
            style={[
              styles.badge,
              sellerType === 'store' ? styles.storeBadge : styles.personalBadge,
            ]}
          >
            {sellerType === 'store' ? '인증가게' : '개인'}
          </Text>

          {item.urgent ? (
            <Text style={[styles.badge, styles.urgentBadge]}>긴급배송</Text>
          ) : null}

          {item.available_today ? (
            <Text style={[styles.badge, styles.todayBadge]}>오늘가능</Text>
          ) : null}

          {item.available_now ? (
            <Text style={[styles.badge, styles.nowBadge]}>지금가능</Text>
          ) : null}
        </View>

        <View style={styles.statusRow}>
  <Text style={[styles.tradeStatusBadge, getTradeStatusStyle(item.status)]}>
    {getTradeStatusLabel(item.status, item.category)}
  </Text>
</View>
{isOwner ? (
  <TouchableOpacity
    style={styles.statusChangeBtn}
    onPress={() => setStatusMenuOpen(true)}
  >
    <Text style={styles.statusChangeText}>상태 변경</Text>
  </TouchableOpacity>
) : null}

<Text style={styles.title}>{item.title}</Text>
        <Text style={styles.price}>{item.price_text || '가격 문의'}</Text>
        {quantityInfo.isMultiQuantity ? (
          <View style={styles.quantityBox}>
            <Ionicons name="cube-outline" size={16} color="#2563eb" />
            <Text style={styles.quantityText}>
              남은 {quantityInfo.remaining}개 / 전체 {quantityInfo.total}개
            </Text>
            {quantityInfo.sold > 0 ? (
              <Text style={styles.quantitySubText}>
                {isShareListing ? '나눔' : '판매'} {quantityInfo.sold}개
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text style={styles.meta}>
          {[item.region, formatTimeAgo(item.created_at)].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>내용</Text>
          <Text style={styles.desc}>
            {item.description || '등록된 설명이 없습니다.'}
          </Text>
        </View>

        {item.latitude != null && item.longitude != null ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>거래 희망 장소</Text>
              <TouchableOpacity onPress={goToTradeMap}>
                <Text style={styles.mapLink}>지도 크게 보기</Text>
              </TouchableOpacity>
            </View>

            <InlineMap latitude={item.latitude} longitude={item.longitude} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>활동 정보</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="heart-outline" size={18} color="#6b7280" />
              <Text style={styles.statText}>관심 {favoriteCount}</Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={18} color="#6b7280" />
              <Text style={styles.statText}>조회 {item.views_count ?? 0}</Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color="#6b7280"
              />
              <Text style={styles.statText}>채팅 {chatCount}</Text>
            </View>
          </View>
        </View>

        {similarItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>비슷한 물품 추천</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.similarRow}>
                {similarItems.map((similar) => {
                  const similarImagePath = similar.listing_images?.[0]?.image_path;
                  const similarImageUrl = similarImagePath
                    ? supabase.storage
                        .from('listing-images')
                        .getPublicUrl(similarImagePath).data.publicUrl
                    : null;

                  return (
                    <TouchableOpacity
                      key={similar.id}
                      style={styles.similarCard}
                      onPress={() => router.push(`/(tabs)/home/post/${similar.id}` as any)}
                    >
                      <View style={styles.similarImageWrap}>
                        {similarImageUrl ? (
                          <Image source={{ uri: similarImageUrl }} style={styles.similarImage} />
                        ) : (
                          <View style={styles.similarPlaceholder}>
                            <Ionicons name="image-outline" size={22} color="#9ca3af" />
                          </View>
                        )}
                      </View>
                      <Text style={styles.similarTitle} numberOfLines={2}>
                        {similar.title}
                      </Text>
                      <Text style={styles.similarPrice} numberOfLines={1}>
                        {similar.price_text || '가격 문의'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {renderActionBar()}

      <Modal visible={menuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuBox}>
                <TouchableOpacity style={styles.menuItem} onPress={handleHidePost}>
                  <Text style={styles.menuText}>게시글 숨기기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleBlockAuthor}>
                  <Text style={[styles.menuText, styles.reportText]}>작성자 차단하기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Text style={[styles.menuText, styles.reportText]}>신고하기</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => setMenuOpen(false)}
                >
                  <Text style={styles.menuText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={reportModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setReportModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.reportModalBox}>
                <Text style={styles.reportModalTitle}>신고하기</Text>
                <Text style={styles.reportModalDesc}>
                  신고 항목을 선택하고 필요한 내용을 적어주세요.
                </Text>

                <View style={styles.reportReasonWrap}>
                  {REPORT_REASONS.map((reason) => {
                    const selected = reportReason === reason;

                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reportReasonBtn,
                          selected && styles.reportReasonBtnActive,
                        ]}
                        onPress={() => setReportReason(reason)}
                      >
                        <Text
                          style={[
                            styles.reportReasonText,
                            selected && styles.reportReasonTextActive,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.reportInput}
                  placeholder="신고 내용을 자세히 적어주세요."
                  value={reportContent}
                  onChangeText={setReportContent}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity style={styles.reportSubmitBtn} onPress={submitReport}>
                  <Text style={styles.reportSubmitText}>신고 접수하기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportCancelBtn}
                  onPress={() => setReportModalOpen(false)}
                >
                  <Text style={styles.reportCancelText}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={statusMenuOpen} transparent animationType="fade">
  <TouchableWithoutFeedback onPress={() => setStatusMenuOpen(false)}>
    <View style={styles.modalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.menuBox}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => updateListingStatus('active')}
          >
            <Text style={styles.menuText}>거래중으로 변경</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => updateListingStatus('reserved')}
          >
            <Text style={styles.menuText}>예약중으로 변경</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => updateListingStatus('done')}
          >
            <Text style={styles.menuText}>
              {isShareListing ? '나눔 완료 처리하기' : '판매 처리하기'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={toggleListingVisibility}
          >
            <Text style={[styles.menuText, item?.status === 'hidden' ? styles.restoreText : styles.reportText]}>
              {item?.status === 'hidden' ? '숨김 취소하기' : '게시글 숨기기'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

<Modal visible={buyerModalOpen} transparent animationType="fade">
  <TouchableWithoutFeedback onPress={() => setBuyerModalOpen(false)}>
    <View style={styles.modalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.menuBox}>
          <Text style={styles.modalTitle}>
            {isShareListing ? '나눔한 상대와 수량을 선택하세요' : '거래한 상대와 수량을 선택하세요'}
          </Text>

          <View style={styles.saleQuantityBox}>
            <Text style={styles.saleQuantityLabel}>
              {isShareListing ? '나눔 수량' : '판매 수량'}
            </Text>
            <TextInput
              style={styles.saleQuantityInput}
              keyboardType="number-pad"
              value={saleQuantityText}
              onChangeText={(value) => {
                const onlyNumber = value.replace(/[^0-9]/g, '');
                setSaleQuantityText(onlyNumber);
              }}
              placeholder="1"
            />
            <Text style={styles.saleQuantityHint}>
              남은 수량 {quantityInfo.remaining}개
            </Text>
          </View>

          {chatUsers.length === 0 ? (
            <Text style={styles.emptyBuyerText}>채팅한 상대가 없습니다.</Text>
          ) : (
            chatUsers.map((buyer) => (
              <TouchableOpacity
                key={buyer.id}
                style={styles.menuItem}
                onPress={() => completeDealWithBuyer(buyer.id, buyer.roomId)}
              >
                <Text style={styles.menuText}>{buyer.name}</Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setBuyerModalOpen(false)}
          >
            <Text style={styles.menuText}>취소</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>


<Modal visible={imageViewerOpen} transparent animationType="fade">
  <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.fullImageOverlay}>
      <TouchableOpacity
        style={styles.fullImageCloseBtn}
        onPress={() => setImageViewerOpen(false)}
      >
        <Ionicons name="close" size={32} color="#fff" />
      </TouchableOpacity>

      {Platform.OS === 'web' ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: selectedImageIndex * SCREEN_WIDTH, y: 0 }}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setSelectedImageIndex(index);
          }}
        >
          {imageUrls.map((url: any, index: number) => (
            <View key={`${url}-${index}`} style={styles.fullImagePage}>
              <Image
                source={{ uri: url as string }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            </View>
          ))}
        </ScrollView>
      ) : imageUrls.length > 0 ? (
        <View style={styles.fullImagePage}>
          <ZoomableImage
            uri={imageUrls[selectedImageIndex] as string}
            onPrev={goPrevImage}
            onNext={goNextImage}
          />
        </View>
      ) : null}

      {imageUrls.length > 1 ? (
        <Text style={styles.fullImageCount}>
          {selectedImageIndex + 1} / {imageUrls.length}
        </Text>
      ) : null}
    </View>
  </GestureHandlerRootView>
</Modal>

      <ContactQrModal
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        deepLinkUrl={appChatDeepLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 44,
  },

  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },

  content: {
    paddingBottom: 140,
  },

  imageWrap: {
    width: '100%',
    height: Platform.OS === 'web' ? 560 : 460,
    backgroundColor: '#f6f7f9',
    overflow: 'hidden',
  },

  mainImage: {
    width: SCREEN_WIDTH,
    height: '100%',
    backgroundColor: '#f6f7f9',
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderTopColor: '#f3f4f6',
  },

  sellerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fullImagePage: {
  flex: 1,
  width: SCREEN_WIDTH,
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
},

fullImagePrevBtn: {
  position: 'absolute',
  left: 14,
  top: '48%',
  zIndex: 30,
},

fullImageNextBtn: {
  position: 'absolute',
  right: 14,
  top: '48%',
  zIndex: 30,
},

  sellerInfo: {
    flex: 1,
  },

  sellerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  statusRow: {
  flexDirection: 'row',
  paddingHorizontal: 16,
  paddingTop: 16,
},

tradeStatusBadge: {
  alignSelf: 'flex-start',
  paddingHorizontal: 9,
  paddingVertical: 5,
  borderRadius: 9,
  overflow: 'hidden',
  fontSize: 12,
  fontWeight: '800',
},

activeStatusBadge: {
  backgroundColor: '#ecfdf5',
  color: '#16a34a',
},

reservedStatusBadge: {
  backgroundColor: '#fef3c7',
  color: '#d97706',
},
zoomGestureBox: {
  flex: 1,
  width: SCREEN_WIDTH,
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
},

soldStatusBadge: {
  backgroundColor: '#f3f4f6',
  color: '#6b7280',
},

hiddenStatusBadge: {
  backgroundColor: '#e5e7eb',
  color: '#374151',
},

  sellerType: {
    marginTop: 2,
    fontSize: 13,
    color: '#6b7280',
  },
  sellerDecorRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sellerVerifiedBadge: {
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
    color: '#fff',
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '900',
  },
  sellerLevelBadge: {
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '900',
  },

  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },

  storeBadge: {
    backgroundColor: '#1d4ed8',
    color: '#fff',
  },

  personalBadge: {
    backgroundColor: '#ecfdf5',
    color: '#16a34a',
  },

  urgentBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
  },

  todayBadge: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },

  statusChangeBtn: {
  alignSelf: 'flex-start',
  marginHorizontal: 16,
  marginTop: 8,
  backgroundColor: '#111827',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 8,
},

statusChangeText: {
  color: '#fff',
  fontWeight: '800',
  fontSize: 12,
},

modalTitle: {
  fontSize: 17,
  fontWeight: '800',
  color: '#111827',
  paddingHorizontal: 18,
  paddingVertical: 14,
},

saleQuantityBox: {
  paddingHorizontal: 18,
  paddingBottom: 12,
  gap: 8,
},

saleQuantityLabel: {
  fontSize: 13,
  fontWeight: '800',
  color: '#374151',
},

saleQuantityInput: {
  borderWidth: 1,
  borderColor: '#d1d5db',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 11,
  fontSize: 15,
  fontWeight: '700',
  color: '#111827',
},

saleQuantityHint: {
  fontSize: 12,
  color: '#6b7280',
  fontWeight: '600',
},

emptyBuyerText: {
  color: '#6b7280',
  paddingHorizontal: 18,
  paddingVertical: 14,
},

  nowBadge: {
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
  },

  title: {
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 34,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  price: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sellerAvatarImage: {
  width: '100%',
  height: '100%',
  borderRadius: 21,
},

  quantityBox: {
    marginHorizontal: 16,
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  quantityText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
  },

  quantitySubText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },

  meta: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mainImageTouch: {
    width: SCREEN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageCountBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  imageCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },

  imageDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 64,
  },

  imageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(17,24,39,0.25)',
  },

  imageDotActive: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#111827',
  },

  imageNavBtn: {
    position: 'absolute',
    top: '50%',
    width: 48,
    height: 48,
    marginTop: -24,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },

  imageNavLeft: {
    left: 18,
  },

  imageNavRight: {
    right: 18,
  },

fullImageOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.96)',
},

fullImage: {
  width: SCREEN_WIDTH,
  height: '100%',
},

fullImageCloseBtn: {
  position: 'absolute',
  top: 44,
  right: 18,
  zIndex: 20,
},

fullImageCount: {
  position: 'absolute',
  bottom: 36,
  color: '#fff',
  fontSize: 15,
  fontWeight: '800',
},

  section: {
    paddingHorizontal: 16,
    paddingTop: 26,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },

  mapLink: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 13,
  },

  desc: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },

  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  statText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },

  similarRow: {
    flexDirection: 'row',
    gap: 12,
  },

  similarCard: {
    width: 140,
  },

  similarImageWrap: {
    width: 140,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },

  similarImage: {
    width: '100%',
    height: '100%',
  },

  similarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  similarTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 20,
  },

  similarPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },

  heartBtn: {
    width: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  chatBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  chatBtnDisabled: {
    opacity: 0.75,
  },

  chatBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  phoneBtn: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },

  phoneBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
    padding: 16,
  },

  menuBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 8,
  },

  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },

  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  reportText: {
    color: '#dc2626',
  },

  reportModalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    maxHeight: '86%',
  },

  reportModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  reportModalDesc: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },

  reportReasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },

  reportReasonBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },

  reportReasonBtnActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fee2e2',
  },

  reportReasonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },

  reportReasonTextActive: {
    color: '#dc2626',
  },

  reportInput: {
    marginTop: 14,
    minHeight: 92,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },

  reportSubmitBtn: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    paddingVertical: 13,
    alignItems: 'center',
  },

  reportSubmitText: {
    color: '#fff',
    fontWeight: '900',
  },

  reportCancelBtn: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    alignItems: 'center',
  },

  reportCancelText: {
    color: '#374151',
    fontWeight: '900',
  },

  restoreText: {
    color: '#15803d',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
