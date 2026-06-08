import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { getProfileImageUrl } from '../../lib/profileImage';
import { supabase } from '../../lib/supabase';

function getProfileImageUploadInfo(asset: ImagePicker.ImagePickerAsset) {
  const rawMimeType = asset.mimeType?.toLowerCase() || '';
  const fileName = asset.fileName?.toLowerCase() || asset.uri.toLowerCase();

  if (rawMimeType.includes('png') || fileName.endsWith('.png')) {
    return { ext: 'png', contentType: 'image/png' };
  }

  if (rawMimeType.includes('webp') || fileName.endsWith('.webp')) {
    return { ext: 'webp', contentType: 'image/webp' };
  }

  return { ext: 'jpg', contentType: 'image/jpeg' };
}

export default function ProfileEditScreen() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
  }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);

  const [userType, setUserType] = useState<'store' | 'personal'>('personal');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [isPhonePublic, setIsPhonePublic] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [selectedAvatarAsset, setSelectedAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  const [businessNumber, setBusinessNumber] = useState('');
  const [businessVerified, setBusinessVerified] = useState(false);
  const [verifyingBusiness, setVerifyingBusiness] = useState(false);
  const [storeAddress, setStoreAddress] = useState('');
  const [storeLatitude, setStoreLatitude] = useState<number | null>(null);
  const [storeLongitude, setStoreLongitude] = useState<number | null>(null);

  const [message, setMessage] = useState('');
  const hasStoreLocationParams = Boolean(params.lat && params.lng);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!params.lat || !params.lng) return;

    const latitude = Number(params.lat);
    const longitude = Number(params.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setStoreLatitude(latitude);
    setStoreLongitude(longitude);
  }, [params.lat, params.lng]);

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (!error && data) {
      setUserType(data.user_type);
      setDisplayName(data.display_name || '');
      setPhone(data.phone || '');
      setIsPhonePublic(!!data.is_phone_public);
      setAvatarPath(data.avatar_path || data.avatar_url || null);
      setAvatarPreviewUri(null);
      setSelectedAvatarAsset(null);
      setBusinessNumber(data.business_number || '');
      setBusinessVerified(!!data.business_verified);
      setStoreAddress(data.store_address || '');

      if (!hasStoreLocationParams) {
        setStoreLatitude(data.store_latitude ?? null);
        setStoreLongitude(data.store_longitude ?? null);
      }
    }
  };

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage('프로필 사진을 선택하려면 앨범 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setSelectedAvatarAsset(asset);
    setAvatarPreviewUri(asset.uri);
    setMessage('');
  };

  const uploadProfileImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user) return null;

    const { ext, contentType } = getProfileImageUploadInfo(asset);
    const filePath = `${user.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    let uploadData: Blob | ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(asset.uri);
      uploadData = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });

      uploadData = decode(base64);
    }

    const { error } = await supabase.storage
      .from('profile-images')
      .upload(filePath, uploadData, {
        contentType,
        upsert: false,
      });

    if (error) throw error;

    return filePath;
  };

  const handleVerifyBusiness = async () => {
    if (!businessNumber.trim()) {
      setMessage('사업자등록번호를 입력해 주세요.');
      return;
    }

    try {
      setVerifyingBusiness(true);
      setMessage('');

      const { data, error } = await supabase.functions.invoke(
        'verify-business-number',
        {
          body: {
            businessNumber: businessNumber.replace(/[^0-9]/g, ''),
          },
        }
      );

      if (error) {
        setBusinessVerified(false);
        setMessage(error.message);
        return;
      }

      if (!data?.valid) {
        setBusinessVerified(false);
        setMessage(data?.error || '유효한 사업자등록번호가 아닙니다.');
        return;
      }

      setBusinessVerified(true);

      if (data?.companyName) {
        setDisplayName(data.companyName);
      }

      setMessage('사업자 확인이 완료되었습니다.');
    } catch (e: any) {
      setBusinessVerified(false);
      setMessage(e?.message || '사업자 확인 중 오류가 발생했습니다.');
    } finally {
      setVerifyingBusiness(false);
    }
  };

  const openStoreLocationPicker = () => {
    router.push({
      pathname: '/map-picker',
      params: {
        lat: storeLatitude != null ? String(storeLatitude) : undefined,
        lng: storeLongitude != null ? String(storeLongitude) : undefined,
        returnTo: '/profile/edit',
        title: '가게 위치 선택',
        desc: '핀을 옮겨서 실제 가게 위치를 선택해 주세요.',
        buttonText: '가게 위치로 선택',
      },
    } as any);
  };

  const handleSave = async () => {
    if (!user) return;

    if (!displayName.trim()) {
      setMessage(
        userType === 'store'
          ? '상호명을 입력해 주세요.'
          : '닉네임을 입력해 주세요.'
      );
      return;
    }

    if (userType === 'store') {
      if (!businessNumber.trim()) {
        setMessage('사업자등록번호를 입력해 주세요.');
        return;
      }

      if (!businessVerified) {
        setMessage('사업자 확인을 먼저 진행해 주세요.');
        return;
      }
    }

    try {
      setLoading(true);
      setMessage('');

      let nextAvatarPath = avatarPath;

      if (selectedAvatarAsset) {
        nextAvatarPath = await uploadProfileImage(selectedAvatarAsset);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          user_type: userType,
          display_name: displayName.trim(),
          phone: phone.trim() || null,
          is_phone_public: userType === 'store' ? isPhonePublic : false,
          avatar_path: nextAvatarPath,
          store_address:
            userType === 'store' && businessVerified
              ? storeAddress.trim() || null
              : null,
          store_latitude:
            userType === 'store' && businessVerified ? storeLatitude : null,
          store_longitude:
            userType === 'store' && businessVerified ? storeLongitude : null,
          business_number:
            userType === 'store'
              ? businessNumber.replace(/[^0-9]/g, '')
              : null,
          business_verified: userType === 'store' ? businessVerified : false,
          business_verified_at:
            userType === 'store' && businessVerified
              ? new Date().toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      setAvatarPath(nextAvatarPath);
      setSelectedAvatarAsset(null);
      setAvatarPreviewUri(null);
      setMessage('프로필이 수정되었습니다.');
    } catch (e: any) {
      setMessage(e?.message || '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const profileImageUrl = avatarPreviewUri || getProfileImageUrl(avatarPath);
  const storeLocationSelected = storeLatitude != null && storeLongitude != null;

  return (
    <>
    <Stack.Screen options={{ title: '프로필수정' }} />
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarButton} onPress={pickProfileImage}>
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person-outline" size={34} color="#9ca3af" />
            </View>
          )}

          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={pickProfileImage}>
          <Text style={styles.avatarText}>프로필 사진 변경</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>계정 유형</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.typeBtn, userType === 'personal' && styles.typeBtnActive]}
          onPress={() => {
            setUserType('personal');
            setBusinessVerified(false);
            setBusinessNumber('');
          }}
        >
          <Text
            style={[
              styles.typeText,
              userType === 'personal' && styles.typeTextActive,
            ]}
          >
            개인
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeBtn, userType === 'store' && styles.typeBtnActive]}
          onPress={() => {
            setUserType('store');
            setBusinessVerified(false);
          }}
        >
          <Text
            style={[
              styles.typeText,
              userType === 'store' && styles.typeTextActive,
            ]}
          >
            가게
          </Text>
        </TouchableOpacity>
      </View>

      {userType === 'store' && (
        <>
          <Text style={styles.label}>사업자등록번호</Text>
          <TextInput
            style={styles.input}
            value={businessNumber}
            onChangeText={(text) => {
              setBusinessNumber(text);
              setBusinessVerified(false);
            }}
            placeholder="123-45-67890"
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={handleVerifyBusiness}
            disabled={verifyingBusiness}
          >
            <Text style={styles.verifyBtnText}>
              {verifyingBusiness ? '사업자 확인 중...' : '사업자 확인'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.statusText, businessVerified && styles.successText]}>
            {businessVerified ? '사업자 확인 완료' : '사업자 확인이 필요합니다.'}
          </Text>

          {businessVerified ? (
            <>
              <Text style={styles.label}>가게 주소</Text>
              <TextInput
                style={styles.input}
                value={storeAddress}
                onChangeText={setStoreAddress}
                placeholder="예: 서울 중구 세종대로 110 1층"
              />

              <TouchableOpacity
                style={styles.locationBtn}
                onPress={openStoreLocationPicker}
              >
                <Ionicons name="map-outline" size={18} color="#111827" />
                <Text style={styles.locationBtnText}>지도에서 가게 위치 선택</Text>
              </TouchableOpacity>

              <Text style={styles.statusText}>
                {storeLocationSelected
                  ? `${storeLatitude?.toFixed(6)}, ${storeLongitude?.toFixed(6)}`
                  : '지도 위치를 선택하면 판매자 정보에서 지도로 확인할 수 있습니다.'}
              </Text>
            </>
          ) : null}
        </>
      )}

      <Text style={styles.label}>{userType === 'store' ? '상호명' : '닉네임'}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={
          userType === 'store' ? '상호명을 입력하세요' : '닉네임을 입력하세요'
        }
      />

      <Text style={styles.label}>전화번호</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="01012345678"
        keyboardType="phone-pad"
      />

      {userType === 'store' && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>전화번호 공개</Text>
          <Switch value={isPhonePublic} onValueChange={setIsPhonePublic} />
        </View>
      )}

      {message ? (
        <Text
          style={[
            styles.messageText,
            message.includes('완료') || message.includes('수정되었습니다')
              ? styles.successText
              : styles.errorText,
          ]}
        >
          {message}
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={handleSave}
        disabled={loading}
      >
        <Text style={styles.saveBtnText}>
          {loading ? '저장 중...' : '저장하기'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },

  avatarButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
    backgroundColor: '#e5e7eb',
  },

  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  avatarText: {
    color: '#2563eb',
    fontWeight: '800',
  },

  label: { fontSize: 15, fontWeight: '700', color: '#111827' },

  row: { flexDirection: 'row', gap: 10 },

  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },

  typeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },

  typeText: { fontWeight: '700', color: '#374151' },
  typeTextActive: { color: '#fff' },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
  },

  switchRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  verifyBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },

  verifyBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },

  locationBtnText: {
    color: '#111827',
    fontWeight: '800',
  },

  statusText: {
    fontSize: 14,
    color: '#6b7280',
  },

  saveBtn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },

  saveBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  messageText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  successText: {
    color: '#16a34a',
  },

  errorText: {
    color: '#dc2626',
  },
});
