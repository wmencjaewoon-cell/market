import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMyActiveRegion } from '../../../../lib/active_region';
import { sendKeywordAlertsForListing } from '../../../../lib/listingNotifications';
import { checkProhibitedContent } from '../../../../lib/prohibited';
import { supabase } from '../../../../lib/supabase';

export default function CreateWantScreen() {
  const params = useLocalSearchParams<{
  lat?: string;
  lng?: string;
  regionChanged?: string;
  regionName?: string;
  regionLat?: string;
  regionLng?: string;
}>();

  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [description, setDescription] = useState('');
  const [detailLocation, setDetailLocation] = useState('');

  const [activeRegionName, setActiveRegionName] = useState('');
  const [activeRegionLat, setActiveRegionLat] = useState<number | null>(null);
const [activeRegionLng, setActiveRegionLng] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useFocusEffect(
  useCallback(() => {
    if (params.regionChanged || params.regionName) return;
    loadActiveRegion();
  }, [params.regionChanged, params.regionName])
);

useEffect(() => {
  const init = async () => {
    if (!params.regionName) {
      await loadActiveRegion();
    }
    await initDefaultLocation();
  };
  init();
}, []);

useEffect(() => {
  if (!params.regionChanged) return;

  if (params.regionName) {
    setActiveRegionName(String(params.regionName));
    setActiveRegionLat(params.regionLat ? Number(params.regionLat) : null);
    setActiveRegionLng(params.regionLng ? Number(params.regionLng) : null);
    return;
  }

  loadActiveRegion();
}, [params.regionChanged, params.regionName, params.regionLat, params.regionLng]);

  useEffect(() => {
    if (params.lat && params.lng) {
      setLatitude(Number(params.lat));
      setLongitude(Number(params.lng));
      setSuccessMessage('거래 희망 장소가 선택되었습니다.');
    }
  }, [params.lat, params.lng]);

  const loadActiveRegion = async () => {
    try {
      const region = await getMyActiveRegion();
      setActiveRegionName(region.region_name);
setActiveRegionLat(region.latitude);
setActiveRegionLng(region.longitude);
    } catch (e: any) {
      setErrorMessage(e?.message || '대표 동네를 먼저 설정해 주세요.');
    }
  };

  const initDefaultLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(current.coords.latitude);
      setLongitude(current.coords.longitude);
    } catch (e) {
      console.log('초기 위치 불러오기 실패:', e);
    }
  };
  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const MAX_DISTANCE_KM = 30;

const distanceFromRegion =
  activeRegionLat != null &&
  activeRegionLng != null &&
  latitude != null &&
  longitude != null
    ? getDistanceKm(activeRegionLat, activeRegionLng, latitude, longitude)
    : null;

const isTooFarFromRegion =
  distanceFromRegion != null && distanceFromRegion > MAX_DISTANCE_KM;

  const handleCreate = async () => {
    try {
      setErrorMessage('');
      setSuccessMessage('');

      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        setErrorMessage('로그인이 필요합니다.');
        return;
      }

      if (!title.trim()) {
        setErrorMessage('구하는 자재명을 입력해 주세요.');
        return;
      }

      if (latitude == null || longitude == null) {
        setErrorMessage('거래 희망 장소를 지도에서 선택해 주세요.');
        return;
      }

      if (isTooFarFromRegion) {
  setErrorMessage('거래 장소와 가까운 동네로 대표 동네를 변경해 주세요.');
  return;
}

      const blockedKeyword = checkProhibitedContent(title, description);

      if (blockedKeyword) {
        setErrorMessage(`"${blockedKeyword}" 관련 물품은 등록할 수 없습니다.`);
        return;
      }


      setSubmitting(true);

      const { data: inserted, error } = await supabase
  .from('listings')
  .insert({
    author_id: data.user.id,
    category: 'want',
    title: title.trim(),
    price_text: priceText.trim() || null,
    region: activeRegionName,
    latitude,
    longitude,
    detail_location: detailLocation.trim() || null,
    description: description.trim() || null,
    status: 'active',
  })
  .select()
  .single();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await sendKeywordAlertsForListing({
  listingId: inserted.id,
  title,
  content: description,
  region: activeRegionName,
  authorId: data.user.id,
});

      setSuccessMessage('구해요 글이 등록되었습니다.');
      router.replace('/(tabs)/home');
    } catch (e: any) {
      console.log('등록 실패:', e);
      setErrorMessage(e?.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>구해요 등록</Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>게시글이 올라갈 동네</Text>
        <Text style={styles.infoValue}>
          {activeRegionName || '대표 동네를 불러오는 중...'}
        </Text>
        <Text style={styles.infoDesc}>
          게시글은 현재 선택된 대표 동네에 등록됩니다.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.mapBtn}
        onPress={() =>
          router.push({
            pathname: '/map-picker',
            params: {
              lat: String(latitude ?? 37.5665),
              lng: String(longitude ?? 126.9780),
              returnTo: '/(tabs)/home/create/want',
            },
          } as any)
        }
      >
        <Text style={styles.mapBtnText}>지도에서 거래 희망 장소 선택</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>선택된 거래 희망 장소</Text>
        <Text style={styles.infoValue}>
          {latitude != null && longitude != null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : '아직 선택되지 않았습니다.'}
        </Text>
        <Text style={styles.infoDesc}>
          이 좌표는 상세페이지 지도와 거리 계산에 사용됩니다.
        </Text>
      </View>

      <TextInput
  style={styles.input}
  placeholder="자세한 위치 예: 정문 앞, 1층 로비, ○○마트 앞"
  placeholderTextColor="#9ca3af"
  value={detailLocation}
  onChangeText={setDetailLocation}
/>

      {isTooFarFromRegion && (
  <View style={styles.warningBox}>
    <Text style={styles.warningTitle}>대표 동네와 거래 장소가 너무 멀어요</Text>

    <Text style={styles.warningText}>
      약 {distanceFromRegion?.toFixed(1)}km 떨어져 있습니다.
    </Text>

    <TouchableOpacity
      style={styles.changeRegionBtn}
      onPress={() => {
        router.push({
          pathname: '/(tabs)/home/regions',
          params: {
            returnTo: '/(tabs)/home/create/want',
            mode: 'select',
          },
        } as any);
      }}
    >
      <Text style={styles.changeRegionBtnText}>대표 동네 바꾸기</Text>
    </TouchableOpacity>
  </View>
)}

      <TextInput
        style={styles.input}
        placeholder="구하는 자재명"
        value={title}
        onChangeText={setTitle}
      />

      <TextInput
        style={styles.input}
        placeholder="예산 또는 협의"
        value={priceText}
        onChangeText={setPriceText}
      />

      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="설명"
        multiline
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.noticeText}>
        게시글 지역은 대표 동네로 자동 저장되고, 거래 희망 장소는 지도에서 선택한 위치로 저장됩니다.
      </Text>

      <Text style={styles.noticeText}>
        개인 간 거래의 책임은 거래 당사자에게 있으며, 위험 자재나 법령상 제한 물품은 등록할 수 없습니다.
      </Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      <TouchableOpacity
        style={[styles.btn, submitting && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={submitting}
      >
        <Text style={styles.btnText}>{submitting ? '등록 중...' : '등록하기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },

  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
    color: '#111827',
  },

  infoBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f9fafb',
    gap: 6,
  },

  warningBox: {
  borderWidth: 1,
  borderColor: '#f59e0b',
  borderRadius: 14,
  padding: 14,
  backgroundColor: '#fffbeb',
},

warningTitle: {
  fontWeight: '800',
  color: '#92400e',
},

warningText: {
  fontSize: 13,
  color: '#92400e',
},

changeRegionBtn: {
  marginTop: 8,
  backgroundColor: '#f59e0b',
  padding: 10,
  borderRadius: 10,
  alignItems: 'center',
},

changeRegionBtnText: {
  color: '#fff',
  fontWeight: '800',
},

  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  infoDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6b7280',
  },

  mapBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },

  mapBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },

  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },

  noticeText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },

  errorText: {
    color: '#dc2626',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  successText: {
    color: '#16a34a',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },

  btnDisabled: {
    opacity: 0.6,
  },

  btnText: {
    color: '#fff',
    fontWeight: '800',
  },
});