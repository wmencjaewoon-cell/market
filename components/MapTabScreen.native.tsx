import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { checkProhibitedContent } from '../lib/prohibited';
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
  listing_images?: {
    id: number;
    image_path: string;
    sort_order: number | null;
  }[];
};

type StoreMapItem = {
  id: string;
  display_name: string | null;
  store_address: string | null;
  store_intro: string | null;
  store_today_available: boolean | null;
  store_card_available: boolean | null;
  store_cash_receipt_available: boolean | null;
  store_tax_invoice_available: boolean | null;
  store_latitude: number;
  store_longitude: number;
};

type GroupedMarker = {
  key: string;
  latitude: number;
  longitude: number;
  items: ListingMapItem[];
};

type StoreGroupedMarker = {
  key: string;
  latitude: number;
  longitude: number;
  items: StoreMapItem[];
};

type MapLayer = 'listings' | 'stores';

function roundCoord(value: number, precision = 3) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export default function MapTabScreen() {
  const mapRef = useRef<MapView | null>(null);
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ListingMapItem[]>([]);
  const [stores, setStores] = useState<StoreMapItem[]>([]);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('listings');
  const [search, setSearch] = useState('');
  const [searchBlockedMessage, setSearchBlockedMessage] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListingMapItem | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreMapItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ListingMapItem[]>([]);
  const [selectedStoreGroup, setSelectedStoreGroup] = useState<StoreMapItem[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [storeGroupModalOpen, setStoreGroupModalOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [tracksMarkerViewChanges, setTracksMarkerViewChanges] = useState(true);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    fetchListings();
    fetchStores();
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
      .select(`
        id,
        title,
        category,
        region,
        price_text,
        latitude,
        longitude,
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.log('지도 매물 조회 실패:', error);
      return;
    }

    const mapped = (data || []).map((item: any) => ({
      ...item,
      listing_images: [...(item.listing_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    setItems(mapped as ListingMapItem[]);
  };

  const fetchStores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        store_address,
        store_intro,
        store_today_available,
        store_card_available,
        store_cash_receipt_available,
        store_tax_invoice_available,
        store_latitude,
        store_longitude
      `)
      .eq('user_type', 'store')
      .eq('business_verified', true)
      .not('store_latitude', 'is', null)
      .not('store_longitude', 'is', null);

    if (error) {
      console.log('지도 가게 조회 실패:', error);
      return;
    }

    setStores(data as StoreMapItem[]);
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
    setSelectedStore(null);
    setSelectedGroup([]);
    setSelectedStoreGroup([]);
    setGroupModalOpen(false);
    setStoreGroupModalOpen(false);
    void fetchListings();
    void fetchStores();
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

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return stores;

    return stores.filter((store) => {
      return (
        store.display_name?.toLowerCase().includes(keyword) ||
        store.store_address?.toLowerCase().includes(keyword) ||
        store.store_intro?.toLowerCase().includes(keyword)
      );
    });
  }, [search, stores]);

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

  const groupedStoreMarkers = useMemo<StoreGroupedMarker[]>(() => {
    const map = new Map<string, StoreMapItem[]>();

    filteredStores.forEach((store) => {
      const lat = roundCoord(store.store_latitude, 3);
      const lng = roundCoord(store.store_longitude, 3);
      const key = `${lat},${lng}`;

      const bucket = map.get(key) || [];
      bucket.push(store);
      map.set(key, bucket);
    });

    return Array.from(map.entries()).map(([key, bucket]) => ({
      key,
      latitude: bucket[0].store_latitude,
      longitude: bucket[0].store_longitude,
      items: bucket,
    }));
  }, [filteredStores]);

  const activeCoordinates = useMemo(() => {
    return activeLayer === 'stores'
      ? groupedStoreMarkers.map((item) => ({
          latitude: item.latitude,
          longitude: item.longitude,
        }))
      : groupedMarkers.map((item) => ({
          latitude: item.latitude,
          longitude: item.longitude,
        }));
  }, [activeLayer, groupedMarkers, groupedStoreMarkers]);

  useEffect(() => {
    if (!mapRef.current || activeCoordinates.length === 0) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        activeCoordinates,
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
  }, [activeCoordinates]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    setTracksMarkerViewChanges(true);

    const timer = setTimeout(() => {
      setTracksMarkerViewChanges(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [activeCoordinates]);

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

  const getListingImageUrl = (item: ListingMapItem) => {
    const imagePath = item.listing_images?.[0]?.image_path;
    if (!imagePath) return null;

    const { data } = supabase.storage.from('listing-images').getPublicUrl(imagePath);
    return data.publicUrl;
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

  const handleStoreMarkerPress = (group: StoreGroupedMarker) => {
    if (group.items.length === 1) {
      setSelectedGroup([]);
      setSelectedStoreGroup([]);
      setGroupModalOpen(false);
      setStoreGroupModalOpen(false);
      setSelectedItem(null);
      setSelectedStore(group.items[0]);
      return;
    }

    setSelectedItem(null);
    setSelectedStore(null);
    setSelectedGroup([]);
    setGroupModalOpen(false);
    setSelectedStoreGroup(group.items);
    setStoreGroupModalOpen(true);
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

  const handleSearchChange = (value: string) => {
    const blockedKeyword = checkProhibitedContent(value);

    if (blockedKeyword) {
      setSearch('');
      setSelectedItem(null);
      setSelectedStore(null);
      setSelectedGroup([]);
      setSelectedStoreGroup([]);
      setGroupModalOpen(false);
      setStoreGroupModalOpen(false);
      setSearchBlockedMessage(`"${blockedKeyword}" 관련 판매금지 물품은 검색할 수 없습니다.`);
      return;
    }

    setSearchBlockedMessage('');
    setSearch(value);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
      >
        {activeLayer === 'listings' &&
          groupedMarkers.map((group) => {
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
                <View collapsable={false} style={styles.markerOuter}>
                  <View
                    style={[
                      styles.markerWrap,
                      { backgroundColor: single ? color : '#111827' },
                    ]}
                  >
                    <Text style={styles.markerText}>
                      {single ? getCategoryLabel(first.category) : String(group.items.length)}
                    </Text>
                  </View>
                </View>
              </Marker>
            );
          })}
        {activeLayer === 'stores' &&
          groupedStoreMarkers.map((group) => {
            const single = group.items.length === 1;

            return (
              <Marker
                key={`store-${group.key}`}
                coordinate={{
                  latitude: group.latitude,
                  longitude: group.longitude,
                }}
                tracksViewChanges={Platform.OS === 'android' ? tracksMarkerViewChanges : false}
                onPress={() => handleStoreMarkerPress(group)}
              >
                <View collapsable={false} style={styles.markerOuter}>
                  <View style={[styles.markerWrap, styles.storeMarkerWrap]}>
                    <Text style={styles.markerText}>
                      {single ? '가게' : String(group.items.length)}
                    </Text>
                  </View>
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
          onChangeText={handleSearchChange}
        />
        {searchBlockedMessage ? (
          <Text style={styles.searchBlockedText}>{searchBlockedMessage}</Text>
        ) : null}

        <View style={styles.layerRow}>
          <TouchableOpacity
            style={[styles.layerBtn, activeLayer === 'listings' && styles.layerBtnActive]}
            onPress={() => {
              setActiveLayer('listings');
              setSelectedStore(null);
              setSelectedStoreGroup([]);
              setStoreGroupModalOpen(false);
            }}
          >
            <Text style={[styles.layerText, activeLayer === 'listings' && styles.layerTextActive]}>
              게시글
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.layerBtn, activeLayer === 'stores' && styles.layerBtnActive]}
            onPress={() => {
              setActiveLayer('stores');
              setSelectedItem(null);
              setSelectedGroup([]);
              setGroupModalOpen(false);
            }}
          >
            <Text style={[styles.layerText, activeLayer === 'stores' && styles.layerTextActive]}>
              가게
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.myLocationBtn} onPress={moveToMyLocation}>
        <Text style={styles.myLocationBtnText}>내 위치</Text>
      </TouchableOpacity>

      {!selectedItem && !selectedStore && showHint ? (
        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>
            {activeLayer === 'stores'
              ? '검색하거나 지도 마커를 눌러 인증 가게를 볼 수 있어요.'
              : '검색하거나 지도 마커를 눌러 게시글을 볼 수 있어요.'}
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

          <View style={styles.cardBody}>
            <View style={styles.thumbnailWrap}>
              {getListingImageUrl(selectedItem) ? (
                <Image
                  source={{ uri: getListingImageUrl(selectedItem) as string }}
                  style={styles.thumbnail}
                />
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <Text style={styles.thumbnailPlaceholderText}>사진 없음</Text>
                </View>
              )}
            </View>

            <View style={styles.cardInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {selectedItem.title}
              </Text>

              <Text style={styles.itemMeta} numberOfLines={1}>
                {selectedItem.region || '지역 정보 없음'}
              </Text>

              <Text style={styles.itemPrice} numberOfLines={1}>
                {selectedItem.price_text || '가격 문의'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => router.push(`/(tabs)/home/post/${selectedItem.id}` as any)}
          >
            <Text style={styles.detailBtnText}>게시글 보기</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selectedStore ? (
        <View style={styles.bottomCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.storeBadge}>인증 가게</Text>

            <TouchableOpacity onPress={() => setSelectedStore(null)}>
              <Text style={styles.closeText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.itemTitle} numberOfLines={2}>
            {selectedStore.display_name || '가게'}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {selectedStore.store_address || '주소 정보 없음'}
          </Text>
          {selectedStore.store_intro ? (
            <Text style={styles.storeIntro} numberOfLines={2}>
              {selectedStore.store_intro}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => router.push(`/store/${selectedStore.id}` as any)}
          >
            <Text style={styles.detailBtnText}>가게 보기</Text>
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
                      <View style={styles.groupThumbWrap}>
                        {getListingImageUrl(item) ? (
                          <Image
                            source={{ uri: getListingImageUrl(item) as string }}
                            style={styles.groupThumb}
                          />
                        ) : (
                          <View style={styles.groupThumbPlaceholder} />
                        )}
                      </View>

                      <View style={styles.groupInfo}>
                        <Text style={styles.groupBadge}>
                          {getCategoryLabel(item.category)}
                        </Text>
                        <Text style={styles.groupTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.groupMeta} numberOfLines={1}>
                          {item.region || '지역 정보 없음'} · {item.price_text || '가격 문의'}
                        </Text>
                      </View>
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

      <Modal visible={storeGroupModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setStoreGroupModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>이 위치의 가게</Text>

                <ScrollView style={{ maxHeight: 320 }}>
                  {selectedStoreGroup.map((store) => (
                    <Pressable
                      key={store.id}
                      style={styles.groupItem}
                      onPress={() => {
                        setStoreGroupModalOpen(false);
                        setSelectedStore(store);
                      }}
                    >
                      <View style={styles.groupThumbWrap}>
                        <Ionicons name="storefront-outline" size={24} color="#059669" />
                      </View>

                      <View style={styles.groupInfo}>
                        <Text style={styles.storeGroupBadge}>인증 가게</Text>
                        <Text style={styles.groupTitle} numberOfLines={1}>
                          {store.display_name || '가게'}
                        </Text>
                        <Text style={styles.groupMeta} numberOfLines={1}>
                          {store.store_address || '주소 정보 없음'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setStoreGroupModalOpen(false)}
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
  searchBlockedText: {
    marginTop: 8,
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  layerRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  layerBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingVertical: 8,
    alignItems: 'center',
  },
  layerBtnActive: {
    backgroundColor: '#111827',
  },
  layerText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '900',
  },
  layerTextActive: {
    color: '#fff',
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

  markerOuter: {
  width: 38,
  height: 38,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
},

markerWrap: {
  minWidth: 38,
  height: 38,
  paddingHorizontal: 10,
  borderRadius: 22,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
  borderColor: '#fff',
  overflow: 'hidden',
},

  storeMarkerWrap: {
    backgroundColor: '#059669',
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
  cardBody: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  thumbnailWrap: {
    width: 86,
    height: 86,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
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
  storeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#047857',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  storeIntro: {
    marginTop: 8,
    color: '#374151',
    lineHeight: 20,
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
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  groupThumbWrap: {
    width: 58,
    height: 58,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupThumb: {
    width: '100%',
    height: '100%',
  },
  groupThumbPlaceholder: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  groupInfo: {
    flex: 1,
    minWidth: 0,
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
  storeGroupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#047857',
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
