import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMyActiveRegion } from '../../../../lib/active_region';
import { sendKeywordAlertsForListing } from '../../../../lib/listingNotifications';
import { supabase } from '../../../../lib/supabase';


export default function CreateSellScreen() {
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
  const [quantityText, setQuantityText] = useState('');
  const [description, setDescription] = useState('');
  const [detailLocation, setDetailLocation] = useState('');

  const DRAFT_KEY = "create_sell_draft"
  const [activeRegionLat, setActiveRegionLat] = useState<number | null>(null);
  const [activeRegionLng, setActiveRegionLng] = useState<number | null>(null);

  const [urgent, setUrgent] = useState(false);
  const [availableNow, setAvailableNow] = useState(false);
  const [availableToday, setAvailableToday] = useState(false);

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [activeRegionName, setActiveRegionName] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);

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
  if (!params.regionChanged) return;

  const refresh = async () => {
    if (params.regionName) {
      setActiveRegionName(String(params.regionName));
      setActiveRegionLat(params.regionLat ? Number(params.regionLat) : null);
      setActiveRegionLng(params.regionLng ? Number(params.regionLng) : null);
      return;
    }

    await loadActiveRegion();
  };

  refresh();
}, [params.regionChanged, params.regionName, params.regionLat, params.regionLng]);

  

  useEffect(() => {
  const init = async () => {
    if (!params.regionName) {
      await loadActiveRegion();
    }

    const hasDraft = await loadDraft();

    if (!hasDraft) {
      await initDefaultLocation();
    }
  };

  init();
}, []);

  useEffect(() => {
    if (params.lat && params.lng) {
      setLatitude(Number(params.lat));
      setLongitude(Number(params.lng));
      setSuccessMessage('거래 희망 장소가 선택되었습니다.');
    }
  }, [params.lat, params.lng]);

  const getDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

  const loadActiveRegion = async () => {
    try {
      const region = await getMyActiveRegion();

      setActiveRegionName(region.region_name);
      setActiveRegionLat(region.latitude);
      setActiveRegionLng(region.longitude);
    } catch (e: any) {
      console.log('대표 지역 불러오기 실패:', e);
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

  const pickImage = async () => {
  try {
    setErrorMessage('');
    setSuccessMessage('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('사진을 선택하려면 사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const uris = result.assets.map((asset) => asset.uri);

      setImageUris((prev) => [...prev, ...uris].slice(0, 10));
      setSuccessMessage('사진이 선택되었습니다.');
    }
  } catch (error: any) {
    console.log('이미지 선택 에러:', error);
    setErrorMessage(error?.message || '이미지를 선택하지 못했습니다.');
  }
};

  const uploadImageToStorage = async (
  listingId: number,
  uri: string,
  sortOrder: number
) => {
  const filePath = `listing-${listingId}/${Date.now()}-${sortOrder}.jpg`;

  let uploadData: Blob | ArrayBuffer;

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    uploadData = await response.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    uploadData = decode(base64);
  }

  const { error: uploadError } = await supabase.storage
    .from('listing-images')
    .upload(filePath, uploadData, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { error: imageRowError } = await supabase
    .from('listing_images')
    .insert({
      listing_id: listingId,
      image_path: filePath,
      sort_order: sortOrder,
    });

  if (imageRowError) {
    throw imageRowError;
  }

  return filePath;
};

  const saveDraft = async () => {
  const draft = {
    title,
    priceText,
    quantityText,
    description,
    detailLocation,
    urgent,
    availableNow,
    availableToday,
    latitude,
    longitude,
    imageUris,
  };

  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};


  const loadDraft = async () => {
  try {
    const saved = await AsyncStorage.getItem(DRAFT_KEY);

    if (!saved) return false;

    const draft = JSON.parse(saved);

    setTitle(draft.title || '');
    setPriceText(draft.priceText || '');
    setQuantityText(draft.quantityText || '1');
    setDescription(draft.description || '');
    setDetailLocation(draft.detailLocation || '');
    setUrgent(!!draft.urgent);
    setAvailableNow(!!draft.availableNow);
    setAvailableToday(!!draft.availableToday);
    setImageUris(draft.imageUris || []);

    // 지도에서 새로 선택한 좌표가 없을 때만 임시저장 좌표 복구
    if (!params.lat || !params.lng) {
      setLatitude(draft.latitude ?? null);
      setLongitude(draft.longitude ?? null);
    }

    return true;
  } catch (e) {
    console.log('임시저장 불러오기 실패:', e);
    return false;
  }
};

  const MAX_DISTANCE_KM = 26;

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
        setErrorMessage('제목을 입력해 주세요.');
        return;
      }

      if (!priceText.trim()) {
        setErrorMessage('가격을 입력해 주세요.');
        return;
      }

      const quantity = Number(quantityText);

      if (!Number.isInteger(quantity) || quantity < 1) {
        setErrorMessage('판매 수량은 1개 이상 입력해 주세요.');
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


      setSubmitting(true);

      const { data: inserted, error } = await supabase
        .from('listings')
        .insert({
          author_id: data.user.id,
          category: 'trade',
          title: title.trim(),
          price_text: priceText.trim(),
          region: activeRegionName,
          latitude,
          longitude,
          detail_location: detailLocation.trim() || null,
          description: description.trim() || null,
          urgent,
          available_now: availableNow,
          available_today: availableToday,
          status: 'active',
          quantity_total: quantity,
          quantity_remaining: quantity,
          quantity_sold: 0,
        })
        .select()
        .single();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (!inserted) {
        setErrorMessage('등록 결과를 받지 못했습니다.');
        return;
      }

      await sendKeywordAlertsForListing({
  listingId: inserted.id,
  title,
  content: description,
  region: activeRegionName,
  authorId: data.user.id,
});
      

      if (imageUris.length > 0) {
  for (let i = 0; i < imageUris.length; i++) {
    await uploadImageToStorage(inserted.id, imageUris[i], i);
  }
}

      setSuccessMessage('판매 글이 등록되었습니다.');
      await AsyncStorage.removeItem(DRAFT_KEY);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      console.log('등록 실패:', e);
      setErrorMessage(e?.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
    style={{ flex: 1}}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
  style={styles.screen}
  contentContainerStyle={styles.content}
  keyboardShouldPersistTaps="handled"
>
      <Text style={styles.title}>판매 등록</Text>

      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
  <Text style={styles.imagePickerText}>
    사진 올리기 {imageUris.length > 0 ? `(${imageUris.length}/10)` : ''}
  </Text>
</TouchableOpacity>

{imageUris.length > 0 && (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    {imageUris.map((uri, index) => (
      <View key={`${uri}-${index}`} style={styles.thumbnailWrap}>
        <Image source={{ uri }} style={styles.thumbnailImage} />

        <TouchableOpacity
          style={styles.removeImageBtn}
          onPress={() =>
            setImageUris((prev) => prev.filter((_, i) => i !== index))
          }
        >
          <Text style={styles.removeImageText}>×</Text>
        </TouchableOpacity>
      </View>
    ))}
  </ScrollView>
)}

      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>게시글이 올라갈 동네</Text>
        <Text style={styles.infoValue}>
          {activeRegionName || '대표 동네를 불러오는 중...'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.mapBtn}
        onPress={async () => {
  await saveDraft();

  let mapLat = latitude ?? 37.5665;
  let mapLng = longitude ?? 126.9780;

  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status === 'granted') {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      mapLat = current.coords.latitude;
      mapLng = current.coords.longitude;
    }
  } catch (e) {
    console.log('현재 위치 불러오기 실패:', e);
  }

  router.push({
    pathname: '/map-picker',
    params: {
      lat: String(mapLat),
      lng: String(mapLng),
      returnTo: '/(tabs)/home/create/sell',
    },
  } as any);
}}
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
      현재 게시글이 올라갈 동네와 선택한 거래 희망 장소가 약{' '}
      {distanceFromRegion?.toFixed(1)}km 떨어져 있습니다. 거래 장소와 가까운
      동네로 대표 동네를 변경해 주세요.
    </Text>

    <TouchableOpacity
      style={styles.changeRegionBtn}
      onPress={async () => {
        await saveDraft();
        router.push({
  pathname: '/(tabs)/home/regions',
  params: {
    returnTo: '/(tabs)/home/create/sell',
    mode : 'select',
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
        placeholder="제목"
        placeholderTextColor="#9ca3af"
        value={title}
        onChangeText={setTitle}
      />

      <TextInput
        style={styles.input}
        placeholder="가격"
        placeholderTextColor="#9ca3af"
        keyboardType="numeric"
        value={priceText}
        onChangeText={(text) => {
          const onlyNumber = text.replace(/[^0-9]/g, '');

          if (!onlyNumber) {
            setPriceText('');
            return;
          }

          const formatted =
            Number(onlyNumber).toLocaleString('ko-KR') + '원';

          setPriceText(formatted);
        }}
      />

      <TextInput
        style={styles.input}
        placeholder="판매 수량"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        value={quantityText}
        onChangeText={(value) => {
          const onlyNumber = value.replace(/[^0-9]/g, '');
          setQuantityText(onlyNumber || '');
        }}
      />

      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="설명"
        placeholderTextColor="#9ca3af"
        multiline
        value={description}
        onChangeText={setDescription}
      />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>긴급배송 가능</Text>
        <Switch value={urgent} onValueChange={setUrgent} />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>지금 가능</Text>
        <Switch value={availableNow} onValueChange={setAvailableNow} />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>오늘 가능</Text>
        <Switch value={availableToday} onValueChange={setAvailableToday} />
      </View>

      <Text style={styles.noticeText}>
        게시글 지역은 대표 동네로 자동 저장되고, 거래 희망 장소는 지도에서 선택한 위치로 저장됩니다.
      </Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      <TouchableOpacity
        style={[styles.btn, submitting && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={submitting}
      >
        <Text style={styles.btnText}>
          {submitting ? '등록 중...' : '등록하기'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
    color: '#111827',
  },
  imagePicker: {
    height: 180,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
  },
  imagePickerText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  infoBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f9fafb',
    gap: 6,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warningBox: {
  borderWidth: 1,
  borderColor: '#f59e0b',
  borderRadius: 14,
  padding: 14,
  backgroundColor: '#fffbeb',
  gap: 8,
},
warningTitle: {
  fontSize: 15,
  fontWeight: '800',
  color: '#92400e',
},
warningText: {
  fontSize: 13,
  lineHeight: 20,
  color: '#92400e',
},
changeRegionBtn: {
  marginTop: 4,
  backgroundColor: '#f59e0b',
  borderRadius: 12,
  paddingVertical: 12,
  alignItems: 'center',
},
changeRegionBtnText: {
  color: '#fff',
  fontWeight: '800',
},
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
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
  thumbnailWrap: {
  width: 90,
  height: 90,
  marginRight: 10,
  borderRadius: 12,
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: '#f3f4f6',
},
thumbnailImage: {
  width: '100%',
  height: '100%',
},
removeImageBtn: {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: 'rgba(0,0,0,0.6)',
  alignItems: 'center',
  justifyContent: 'center',
},
removeImageText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '800',
},
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
