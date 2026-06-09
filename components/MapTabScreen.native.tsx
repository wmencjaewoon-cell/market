import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useTabRefresh } from '../lib/tabRefresh';

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

function roundCoord(value: number, precision = 3) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export default function MapTabScreen() {
  const mapRef = useRef<MapView | null>(null);
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ListingMapItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListingMapItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ListingMapItem[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [tracksMarkerViewChanges, setTracksMarkerViewChanges] = useState(true);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    fetchListings();
    loadMyLocation();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const fetchListings = async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, category, region, price_text, latitude, longitude')
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.log('지도 매물 조회 실패:', error);
      return;
    }

    setItems((data || []) as ListingMapItem[]);
  };

  const loadMyLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setMyLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
    } catch (e) {
      console.log('내 위치 불러오기 실패:', e);
    }
  };

  useTabRefresh('map', () => {
    setSelectedItem(null);
    setSelectedGroup([]);
    setGroupModalOpen(false);
    void fetchListings();
    void loadMyLocation();
  });

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) => {
      return (
        item.title?.toLowerCase().includes(keyword) ||
        item.region?.toLowerCase().includes(keyword) ||
        item.price_text?.toLowerCase().includes(keyword) ||
        getCategoryLabel(item.category).toLowerCase().includes(keyword)
      );
    });
  }, [items, search]);

  const groupedMarkers = useMemo<GroupedMarker[]>(() => {
    const map = new Map<string, ListingMapItem[]>();

    filteredItems.forEach((item) => {
      const lat = roundCoord(item.latitude, 3);
      const lng = roundCoord(item.longitude, 3);
      const key = `${lat},${lng}`;

      const bucket = map.get(key) || [];
      bucket.push(item);
      map.set(key, bucket);
    });

    return Array.from(map.entries()).map(([key, bucket]) => ({
      key,
      latitude: bucket[0].latitude,
      longitude: bucket[0].longitude,
      items: bucket,
    }));
  }, [filteredItems]);

  useEffect(() => {
    if (!mapRef.current || groupedMarkers.length === 0) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        groupedMarkers.map((item) => ({
          latitude: item.latitude,
          longitude: item.longitude,
        })),
        {
          edgePadding: {
            top: 120,
            right: 50,
            bottom: 220,
            left: 50,
          },
          animated: true,
        }
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [groupedMarkers]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    setTracksMarkerViewChanges(true);

    const timer = setTimeout(() => {
      setTracksMarkerViewChanges(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [groupedMarkers]);

  const initialRegion: Region = {
    latitude: 37.5665,
    longitude: 126.978,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  function getCategoryLabel(category: ListingMapItem['category']) {
    if (category === 'trade') return '판매';
    if (category === 'share') return '나눔';
    return '구해요';
  }

  const getCategoryColor = (category: ListingMapItem['category']) => {
    if (category === 'trade') return '#2563eb';
    if (category === 'share') return '#16a34a';
    return '#d97706';
  };

  const handleMarkerPress = (group: GroupedMarker) => {
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

  const moveToMyLocation = () => {
    if (!myLocation || !mapRef.current) return;

    mapRef.current.animateToRegion(
      {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      500
    );
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
      >
        {groupedMarkers.map((group) => {
          const single = group.items.length === 1;
          const first = group.items[0];
          const color = getCategoryColor(first.category);

          return (
            <Marker
              key={group.key}
              coordinate={{
                latitude: group.latitude,
                longitude: group.longitude,
              }}
              tracksViewChanges={Platform.OS === 'android' ? tracksMarkerViewChanges : false}
              onPress={() => handleMarkerPress(group)}
            >
              <View
                collapsable={false}
                style={[
                  styles.markerWrap,
                  { backgroundColor: single ? color : '#111827' },
                ]}
              >
                <Text style={styles.markerText}>
                  {single ? getCategoryLabel(first.category) : String(group.items.length)}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.searchBox, { top: Math.max(insets.top + 8, 14) }]}>
        <TextInput
          style={styles.searchInput}
          placeholder="제목, 지역, 물품, 가격으로 검색"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <TouchableOpacity style={styles.myLocationBtn} onPress={moveToMyLocation}>
        <Text style={styles.myLocationBtnText}>내 위치</Text>
      </TouchableOpacity>

      {!selectedItem && showHint ? (
        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>
            검색하거나 지도 마커를 눌러 게시글을 볼 수 있어요.
          </Text>
        </View>
      ) : null}

      {selectedItem ? (
        <View style={styles.bottomCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.itemBadge}>
              {getCategoryLabel(selectedItem.category)}
            </Text>

            <TouchableOpacity onPress={() => setSelectedItem(null)}>
              <Text style={styles.closeText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.itemTitle} numberOfLines={2}>
            {selectedItem.title}
          </Text>

          <Text style={styles.itemMeta}>
            {selectedItem.region || '지역 정보 없음'}
          </Text>

          <Text style={styles.itemPrice}>
            {selectedItem.price_text || '가격 문의'}
          </Text>

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
                    <Pressable
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
                    </Pressable>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  map: { flex: 1 },

  searchBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  searchInput: {
    fontSize: 15,
    color: '#111827',
  },

  myLocationBtn: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  myLocationBtnText: {
    fontWeight: '800',
    color: '#111827',
    fontSize: 13,
  },

  markerWrap: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },

  bottomHint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 14,
  },
  bottomHintText: {
    color: '#374151',
    textAlign: 'center',
  },

  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
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
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
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
