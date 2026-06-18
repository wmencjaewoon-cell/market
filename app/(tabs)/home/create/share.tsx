import { sendKeywordAlertsForListing } from '@/lib/listingNotifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMyActiveRegion } from '../../../../lib/active_region';
import { canCreateListing } from '../../../../lib/guard';
import { checkProhibitedContent } from '../../../../lib/prohibited';
import { supabase } from '../../../../lib/supabase';

export default function CreateShareScreen() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    regionChanged?: string;
    regionName?: string;
    regionLat?: string;
    regionLng?: string;
  }>();

  const [title, setTitle] = useState('');
  const [quantityText, setQuantityText] = useState('');

  const QUANTITY_UNIT_OPTIONS = [
    '개',
    '박스',
    '피스',
    '세트',
    '봉지',
    '묶음',
    '장',
    'kg',
    'g',
    'L',
    'ml',
    '기타',
  ];

  const [quantityUnit, setQuantityUnit] = useState('개');
  const [customQuantityUnit, setCustomQuantityUnit] = useState('');
  const [description, setDescription] = useState('');
  const [detailLocation, setDetailLocation] = useState('');

  const [urgent, setUrgent] = useState(false);
  const [availableNow, setAvailableNow] = useState(false);
  const [availableToday, setAvailableToday] = useState(false);

  const [activeRegionLat, setActiveRegionLat] = useState<number | null>(null);
  const [activeRegionLng, setActiveRegionLng] = useState<number | null>(null);

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

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage('사진 접근 권한이 필요합니다.');
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
    } catch (e: any) {
      setErrorMessage(e?.message || '이미지를 선택하지 못했습니다.');
    }
  };

  const uploadImageToStorage = async (
    listingId: number,
    uri: string,
    sortOrder: number
  ) => {
    const filePath = `listing-${listingId}/${Date.now()}-${sortOrder}.jpg`;

    let fileData: Blob | Uint8Array;

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      fileData = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i += 1) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      fileData = new Uint8Array(byteNumbers);
    }

    const { error: uploadError } = await supabase.storage
      .from('listing-images')
      .upload(filePath, fileData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: imageRowError } = await supabase
      .from('listing_images')
      .insert({
        listing_id: listingId,
        image_path: filePath,
        sort_order: sortOrder,
      });

    if (imageRowError) throw imageRowError;

    return filePath;
  };

  const getFinalQuantityUnit = () => {
    if (quantityUnit === '기타') {
      return customQuantityUnit.trim();
    }

    return quantityUnit;
  };

  const handleCreate = async () => {
    try {
      setErrorMessage('');
      setSuccessMessage('');

      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        setErrorMessage('로그인이 필요합니다.');
        return;
      }

      const guard = await canCreateListing();

      if (!guard.ok) {
        setErrorMessage(guard.reason || '게시글 등록이 제한되어 있습니다.');
        return;
      }

      if (!title.trim()) {
        setErrorMessage('제목을 입력해 주세요.');
        return;
      }

      const quantity = Number(quantityText);

      if (!Number.isInteger(quantity) || quantity < 1) {
        setErrorMessage('나눔 수량은 1개 이상 입력해 주세요.');
        return;
      }

      const finalQuantityUnit = getFinalQuantityUnit();

      if (!finalQuantityUnit) {
        setErrorMessage('수량 단위를 선택하거나 직접 입력해 주세요.');
        return;
      }

      if (finalQuantityUnit.length > 10) {
        setErrorMessage('수량 단위는 10자 이내로 입력해 주세요.');
        return;
      }

      if (latitude == null || longitude == null) {
        setErrorMessage('거래 희망 장소를 선택해 주세요.');
        return;
      }

      if (isTooFarFromRegion) {
        setErrorMessage('거래 장소와 가까운 동네로 대표 동네를 변경해 주세요.');
        return;
      }

      const blockedKeyword = checkProhibitedContent(title, description, detailLocation);
      if (blockedKeyword) {
        setErrorMessage(`"${blockedKeyword}" 관련 판매금지 물품은 등록할 수 없습니다.`);
        return;
      }


      setSubmitting(true);

      const { data: inserted, error } = await supabase
        .from('listings')
        .insert({
          author_id: data.user.id,
          category: 'share',
          title: title.trim(),
          price_text: '무료 나눔',
          region: activeRegionName,
          latitude,
          longitude,
          description: description.trim() || null,
          detail_location: detailLocation.trim() || null,
          urgent,
          available_now: availableNow,
          available_today: availableToday,
          status: 'active',
          quantity_total: quantity,
          quantity_remaining: quantity,
          quantity_sold: 0,
          quantity_unit: finalQuantityUnit,
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

      if (imageUris.length > 0) {
        for (let i = 0; i < imageUris.length; i++) {
          await uploadImageToStorage(inserted.id, imageUris[i], i);
        }
      }

      setSuccessMessage('나눔 글이 등록되었습니다.');
      router.replace('/(tabs)/home');
    } catch (e: any) {
      setErrorMessage(e?.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>나눔 등록</Text>

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
        <Text style={styles.infoValue}>{activeRegionName || '대표 동네를 불러오는 중...'}</Text>
      </View>

      <TouchableOpacity
        style={styles.mapBtn}
        onPress={() =>
          router.push({
            pathname: '/map-picker',
            params: {
              lat: String(latitude ?? 37.5665),
              lng: String(longitude ?? 126.9780),
              returnTo: '/(tabs)/home/create/share',
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
            onPress={() => {
              router.push({
                pathname: '/(tabs)/home/regions',
                params: {
                  returnTo: '/(tabs)/home/create/share',
                  mode: 'select',
                },
              } as any);
            }}
          >
            <Text style={styles.changeRegionBtnText}>대표 동네 바꾸기</Text>
          </TouchableOpacity>
        </View>
      )}

      <TextInput style={styles.input} placeholder="제목" value={title} onChangeText={setTitle} />

      <View style={styles.quantityBox}>
        <View style={styles.quantityInputRow}>
          <TextInput
            style={styles.quantityInput}
            placeholder="나눔 수량"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={quantityText}
            onChangeText={(value) => {
              const onlyNumber = value.replace(/[^0-9]/g, '');
              setQuantityText(onlyNumber || '');
            }}
          />

          <View style={styles.quantityUnitPreview}>
            <Text style={styles.quantityUnitPreviewText}>
              {quantityUnit === '기타' ? customQuantityUnit || '직접입력' : quantityUnit}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quantityUnitOptions}
        >
          {QUANTITY_UNIT_OPTIONS.map((unit) => {
            const selected = quantityUnit === unit;

            return (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.quantityUnitChip,
                  selected && styles.quantityUnitChipActive,
                ]}
                onPress={() => {
                  setQuantityUnit(unit);

                  if (unit !== '기타') {
                    setCustomQuantityUnit('');
                  }
                }}
              >
                <Text
                  style={[
                    styles.quantityUnitChipText,
                    selected && styles.quantityUnitChipTextActive,
                  ]}
                >
                  {unit}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {quantityUnit === '기타' ? (
          <TextInput
            style={styles.input}
            placeholder="단위 직접 입력 예: 마대, 롤, 판"
            placeholderTextColor="#9ca3af"
            value={customQuantityUnit}
            maxLength={10}
            onChangeText={setCustomQuantityUnit}
          />
        ) : null}
      </View>

      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="설명"
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

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      <TouchableOpacity style={styles.btn} onPress={handleCreate} disabled={submitting}>
        <Text style={styles.btnText}>{submitting ? '등록 중...' : '등록하기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
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
  imagePickerText: { color: '#6b7280', fontWeight: '600' },
  previewImage: { width: '100%', height: '100%' },
  infoBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f9fafb',
    gap: 6,
  },
  infoLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mapBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mapBtnText: { color: '#fff', fontWeight: '800' },
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
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  errorText: { color: '#dc2626', fontWeight: '600', lineHeight: 20 },
  successText: { color: '#16a34a', fontWeight: '600', lineHeight: 20 },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },

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
  thumbnailWrap: {
    width: 90,
    height: 90,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f3f4f6',
  },

  quantityBox: {
    gap: 10,
  },

  quantityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  quantityInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },

  quantityUnitPreview: {
    minWidth: 76,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  quantityUnitPreviewText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  quantityUnitOptions: {
    gap: 8,
    paddingRight: 8,
  },

  quantityUnitChip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },

  quantityUnitChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  quantityUnitChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },

  quantityUnitChipTextActive: {
    color: '#fff',
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

});
