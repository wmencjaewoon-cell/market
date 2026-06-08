import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTabRefresh } from '../lib/tabRefresh';

declare global {
  interface Window {
    kakao: any;
  }
}

type ListingMapItem = {
  id: number;
  title: string;
  category: 'trade' | 'share' | 'want';
  region: string | null;
  price_text: string | null;
  latitude: number;
  longitude: number;
};

type GroupedMarker = {
  key: string;
  latitude: number;
  longitude: number;
  items: ListingMapItem[];
};

const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY;

function roundCoord(value: number, precision = 3) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export default function MapTabScreen() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [items, setItems] = useState<ListingMapItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListingMapItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ListingMapItem[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => {
    loadKakaoMap();
  }, []);

  useEffect(() => {
    if (!window.kakao || !mapInstanceRef.current || !mapReady) return;
    renderMarkers();
  }, [items, search, mapReady]);

  const fetchListings = async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, category, region, price_text, latitude, longitude')
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.log('웹 지도 매물 조회 실패:', error);
      return;
    }

    setItems((data || []) as ListingMapItem[]);
  };

  useTabRefresh('map', () => {
    setSelectedItem(null);
    setSelectedGroup([]);
    setGroupModalOpen(false);
    void fetchListings();
  });

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) => {
      return (
        item.title?.toLowerCase().includes(keyword) ||
        item.region?.toLowerCase().includes(keyword) ||
        item.price_text?.toLowerCase().includes(keyword)
      );
    });
  }, [items, search]);

  const groupedMarkers = useMemo<GroupedMarker[]>(() => {
    const grouped = new Map<string, ListingMapItem[]>();

    filteredItems.forEach((item) => {
      const lat = roundCoord(item.latitude, 3);
      const lng = roundCoord(item.longitude, 3);
      const key = `${lat},${lng}`;

      const bucket = grouped.get(key) || [];
      bucket.push(item);
      grouped.set(key, bucket);
    });

    return Array.from(grouped.entries()).map(([key, bucket]) => ({
      key,
      latitude: bucket[0].latitude,
      longitude: bucket[0].longitude,
      items: bucket,
    }));
  }, [filteredItems]);

  const loadKakaoMap = () => {
    if (!KAKAO_KEY) {
      setMapError('카카오 JavaScript 키가 없습니다.');
      return;
    }

    if (window.kakao && window.kakao.maps) {
      createMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    script.async = true;

    script.onload = () => {
      window.kakao.maps.load(() => {
        createMap();
      });
    };

    script.onerror = () => {
      setMapError('카카오 지도 스크립트를 불러오지 못했습니다. 도메인 등록과 키를 확인해 주세요.');
    };

    document.head.appendChild(script);
  };

  const createMap = () => {
    if (!mapRef.current || !window.kakao) {
      setMapError('지도를 초기화하지 못했습니다.');
      return;
    }

    const center = new window.kakao.maps.LatLng(37.5665, 126.9780);

    const map = new window.kakao.maps.Map(mapRef.current, {
      center,
      level: 7,
    });

    mapInstanceRef.current = map;
    setMapReady(true);
  };

  const getCategoryLabel = (category: ListingMapItem['category']) => {
    if (category === 'trade') return '판매';
    if (category === 'share') return '나눔';
    return '구해요';
  };

  const getCategoryColor = (category: ListingMapItem['category']) => {
    if (category === 'trade') return '#2563eb';
    if (category === 'share') return '#16a34a';
    return '#d97706';
  };

  const handleMarkerClick = (group: GroupedMarker) => {
    if (group.items.length === 1) {
      setSelectedGroup([]);
      setGroupModalOpen(false);
      setSelectedItem(group.items[0]);
      return;
    }

    setSelectedItem(null);
    setSelectedGroup(group.items);
    setGroupModalOpen(true);
  };

  const renderMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();

    groupedMarkers.forEach((group) => {
      const first = group.items[0];
      const color = group.items.length === 1 ? getCategoryColor(first.category) : '#111827';

      const markerPosition = new window.kakao.maps.LatLng(group.latitude, group.longitude);

      const content = `
        <div style="
          min-width:44px;
          height:44px;
          padding:0 10px;
          border-radius:22px;
          background:${color};
          border:2px solid #ffffff;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-size:12px;
          font-weight:800;
          box-sizing:border-box;
          box-shadow:0 2px 8px rgba(0,0,0,0.15);
        ">
          ${group.items.length === 1 ? getCategoryLabel(first.category) : group.items.length}
        </div>
      `;

      const marker = new window.kakao.maps.CustomOverlay({
        position: markerPosition,
        content,
        yAnchor: 1,
      });

      marker.setMap(map);

      const el = marker.a;
      if (el) {
        el.style.cursor = 'pointer';
        el.onclick = () => handleMarkerClick(group);
      }

      markersRef.current.push(marker);
      bounds.extend(markerPosition);
    });

    if (groupedMarkers.length > 0) {
      map.setBounds(bounds);
    }
  };

  return (
    <View style={styles.screen}>
      <div ref={mapRef} style={mapDomStyle} />

      {!mapReady && !mapError ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>지도를 불러오는 중...</Text>
        </View>
      ) : null}

      {mapError ? (
        <View style={styles.statusBox}>
          <Text style={styles.errorText}>{mapError}</Text>
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="제목, 지역, 가격으로 검색"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {selectedItem ? (
        <View style={styles.bottomCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.badge}>{getCategoryLabel(selectedItem.category)}</Text>
            <TouchableOpacity onPress={() => setSelectedItem(null)}>
              <Text style={styles.closeText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.itemTitle}>{selectedItem.title}</Text>
          <Text style={styles.itemMeta}>{selectedItem.region || '지역 정보 없음'}</Text>
          <Text style={styles.itemPrice}>{selectedItem.price_text || '가격 문의'}</Text>

          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => router.push(`/(tabs)/home/post/${selectedItem.id}` as any)}
          >
            <Text style={styles.detailBtnText}>게시글 보기</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={groupModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setGroupModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>이 위치의 게시글</Text>

                <ScrollView style={{ maxHeight: 320 }}>
                  {selectedGroup.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.groupItem}
                      onPress={() => {
                        setGroupModalOpen(false);
                        setSelectedItem(item);
                      }}
                    >
                      <Text style={styles.groupBadge}>
                        {getCategoryLabel(item.category)}
                      </Text>
                      <Text style={styles.groupTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.groupMeta} numberOfLines={1}>
                        {item.region || '지역 정보 없음'} · {item.price_text || '가격 문의'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setGroupModalOpen(false)}
                >
                  <Text style={styles.closeBtnText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const mapDomStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  background: '#f3f4f6',
  zIndex: 1,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: 'relative' as any,
  },
  statusBox: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    padding: 12,
    zIndex: 20,
  },
  statusText: {
    color: '#374151',
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
    lineHeight: 20,
  },
  searchBox: {
    position: 'absolute',
    top: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 20,
  },
  searchInput: {
    fontSize: 15,
  },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    zIndex: 20,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeText: {
    color: '#6b7280',
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 24,
  },
  itemMeta: {
    marginTop: 6,
    color: '#6b7280',
  },
  itemPrice: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  detailBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  detailBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
    padding: 16,
    zIndex: 30,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  groupItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  groupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  groupMeta: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 13,
  },
  closeBtn: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
