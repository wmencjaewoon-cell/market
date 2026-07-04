import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import type { DocumentPickerAsset } from 'expo-document-picker';
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
import { getOAuthProfileDefaults } from '../../lib/oauthProfile';
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

type BusinessDocumentAsset =
  | ImagePicker.ImagePickerAsset
  | DocumentPickerAsset;

function getBusinessDocumentUploadInfo(asset: BusinessDocumentAsset) {
  const rawMimeType = asset.mimeType?.toLowerCase() || '';
  const fileName =
    ('name' in asset ? asset.name : asset.fileName)?.toLowerCase() ||
    asset.uri.toLowerCase();

  if (rawMimeType.includes('pdf') || fileName.endsWith('.pdf')) {
    return { ext: 'pdf', contentType: 'application/pdf' };
  }

  if (rawMimeType.includes('png') || fileName.endsWith('.png')) {
    return { ext: 'png', contentType: 'image/png' };
  }

  if (rawMimeType.includes('webp') || fileName.endsWith('.webp')) {
    return { ext: 'webp', contentType: 'image/webp' };
  }

  if (
    rawMimeType.includes('jpeg') ||
    rawMimeType.includes('jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.jpg')
  ) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }

  return null;
}

function getBusinessDocumentMimeTypeFromPath(path?: string | null) {
  const lowerPath = path?.toLowerCase() || '';

  if (lowerPath.endsWith('.pdf')) return 'application/pdf';
  if (lowerPath.endsWith('.png')) return 'image/png';
  if (lowerPath.endsWith('.webp')) return 'image/webp';
  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';

  return null;
}

type StoreVerificationStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_more_info'
  | 'canceled'
  | 'revoked';

type StoreVerificationRequest = {
  id: number;
  business_number: string;
  store_name: string;
  representative_name: string | null;
  phone: string;
  store_address: string | null;
  store_latitude: number | null;
  store_longitude: number | null;
  document_path: string;
  document_mime_type: string | null;
  status: StoreVerificationStatus;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  seller_tax_policy_agreed: boolean;
  business_identity_policy_agreed: boolean;
  store_restriction_policy_agreed: boolean;
  seller_policy_agreed_at: string | null;
};

function getStoreVerificationStatusLabel(status?: StoreVerificationStatus | null) {
  if (status === 'pending') return '관리자 검수 대기중';
  if (status === 'approved') return '가게 인증 완료';
  if (status === 'rejected') return '가게 인증 반려';
  if (status === 'needs_more_info') return '보완 요청';
  if (status === 'canceled') return '신청 취소됨';
  if (status === 'revoked') return '인증 취소됨';
  return '가게 인증 전';
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
  const [email, setEmail] = useState('');
  const [isPhonePublic, setIsPhonePublic] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [selectedAvatarAsset, setSelectedAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  const [businessNumber, setBusinessNumber] = useState('');
  const [businessVerified, setBusinessVerified] = useState(false);
  const [verifyingBusiness, setVerifyingBusiness] = useState(false);
  const [representativeName, setRepresentativeName] = useState('');
  const [storeVerificationStatus, setStoreVerificationStatus] =
    useState<StoreVerificationStatus>('none');
  const [latestStoreRequest, setLatestStoreRequest] =
    useState<StoreVerificationRequest | null>(null);
  const [businessDocumentPath, setBusinessDocumentPath] = useState<string | null>(null);
  const [businessDocumentMimeType, setBusinessDocumentMimeType] = useState<string | null>(null);
  const [businessDocumentName, setBusinessDocumentName] = useState('');
  const [businessDocumentPreviewUri, setBusinessDocumentPreviewUri] =
    useState<string | null>(null);
  const [selectedBusinessDocumentAsset, setSelectedBusinessDocumentAsset] =
    useState<BusinessDocumentAsset | null>(null);
  const [storeAddress, setStoreAddress] = useState('');
  const [storeLatitude, setStoreLatitude] = useState<number | null>(null);
  const [storeLongitude, setStoreLongitude] = useState<number | null>(null);
  const [sellerTaxPolicyAgreed, setSellerTaxPolicyAgreed] = useState(false);
  const [businessIdentityPolicyAgreed, setBusinessIdentityPolicyAgreed] =
    useState(false);
  const [storeRestrictionPolicyAgreed, setStoreRestrictionPolicyAgreed] =
    useState(false);

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
    const oauthProfile = getOAuthProfileDefaults(user);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (!error && data) {
      setUserType(data.user_type === 'store' ? 'store' : 'personal');
      setDisplayName(data.display_name || oauthProfile.displayName || '');
      setPhone(data.phone || oauthProfile.phone || '');
      setEmail(data.email || oauthProfile.email || '');
      setIsPhonePublic(!!data.is_phone_public);
      setAvatarPath(data.avatar_path || data.avatar_url || null);
      setAvatarPreviewUri(null);
      setSelectedAvatarAsset(null);
      setBusinessNumber(data.business_number || '');
      setBusinessVerified(!!data.business_verified);
      setStoreVerificationStatus(data.store_verification_status || 'none');
      setStoreAddress(data.store_address || '');

      if (!hasStoreLocationParams) {
        setStoreLatitude(data.store_latitude ?? null);
        setStoreLongitude(data.store_longitude ?? null);
      }
    } else if (!data) {
      setDisplayName((current) => current || oauthProfile.displayName || '');
      setPhone((current) => current || oauthProfile.phone || '');
      setEmail((current) => current || oauthProfile.email || '');
    }

    const requestResult = await supabase
      .from('store_verification_requests')
      .select(
        'id, business_number, store_name, representative_name, phone, store_address, store_latitude, store_longitude, document_path, document_mime_type, status, admin_note, created_at, reviewed_at, seller_tax_policy_agreed, business_identity_policy_agreed, store_restriction_policy_agreed, seller_policy_agreed_at'
      )
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!requestResult.error && requestResult.data) {
      const request = requestResult.data as StoreVerificationRequest;
      setSellerTaxPolicyAgreed(!!request.seller_tax_policy_agreed);
      setBusinessIdentityPolicyAgreed(!!request.business_identity_policy_agreed);
      setStoreRestrictionPolicyAgreed(!!request.store_restriction_policy_agreed);

      if (request.status === 'revoked') {
        setLatestStoreRequest(null);
        setStoreVerificationStatus('none');
        setBusinessDocumentPath(null);
        setBusinessDocumentMimeType(null);
        setBusinessDocumentName('');
        setSelectedBusinessDocumentAsset(null);
        setBusinessDocumentPreviewUri(null);
        setSellerTaxPolicyAgreed(false);
        setBusinessIdentityPolicyAgreed(false);
        setStoreRestrictionPolicyAgreed(false);
      } else {
        setLatestStoreRequest(request);
        setStoreVerificationStatus(request.status);
        setBusinessDocumentPath(request.document_path || null);
        setBusinessDocumentMimeType(
          request.document_mime_type ||
          getBusinessDocumentMimeTypeFromPath(request.document_path)
        );
        setBusinessDocumentName(
          request.document_path?.split('/').pop() || '기존 제출 서류'
        );
        setSellerTaxPolicyAgreed(!!request.seller_tax_policy_agreed);
        setBusinessIdentityPolicyAgreed(!!request.business_identity_policy_agreed);
        setStoreRestrictionPolicyAgreed(!!request.store_restriction_policy_agreed);
      }

      if (
        request.status !== 'approved' &&
        request.status !== 'revoked' &&
        data?.user_type !== 'store'
      ) {
        setUserType('store');
      }

      if (!data?.business_verified && request.status !== 'revoked') {
        setBusinessNumber(request.business_number || '');
        setDisplayName(request.store_name || '');
        setRepresentativeName(request.representative_name || '');
        setPhone(request.phone || '');
        setStoreAddress(request.store_address || '');

        if (!hasStoreLocationParams) {
          setStoreLatitude(request.store_latitude ?? null);
          setStoreLongitude(request.store_longitude ?? null);
        }
      }
    } else if (requestResult.error && requestResult.error.code !== 'PGRST205') {
      console.log('가게 인증 신청 조회 실패:', requestResult.error);
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

  const setSelectedBusinessDocument = (asset: BusinessDocumentAsset) => {
    const uploadInfo = getBusinessDocumentUploadInfo(asset);

    if (!uploadInfo) {
      setMessage('사업자등록증은 PDF, JPG, PNG, WEBP 파일만 업로드할 수 있습니다.');
      return;
    }

    setSelectedBusinessDocumentAsset(asset);
    setBusinessDocumentMimeType(uploadInfo.contentType);
    setBusinessDocumentName(
      ('name' in asset ? asset.name : asset.fileName) ||
      asset.uri.split('/').pop() ||
      '사업자등록증'
    );
    setBusinessDocumentPreviewUri(
      uploadInfo.contentType.startsWith('image/') ? asset.uri : null
    );
    setMessage('');
  };

  const pickBusinessDocumentImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage('사업자등록증 이미지를 선택하려면 앨범 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled) return;

    setSelectedBusinessDocument(result.assets[0]);
  };

  const pickBusinessDocument = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      setSelectedBusinessDocument(result.assets[0]);
    } catch (error) {
      console.log('사업자등록증 파일 선택기 로드 실패:', error);
      setMessage(
        '현재 설치된 앱에는 PDF 선택 모듈이 아직 없습니다. 앱을 새로 빌드하면 PDF를 선택할 수 있고, 지금은 이미지로 제출할 수 있습니다.'
      );
      await pickBusinessDocumentImage();
    }
  };

  const uploadBusinessDocument = async (asset: BusinessDocumentAsset) => {
    if (!user) return null;

    const uploadInfo = getBusinessDocumentUploadInfo(asset);

    if (!uploadInfo) {
      throw new Error('사업자등록증은 PDF, JPG, PNG, WEBP 파일만 업로드할 수 있습니다.');
    }

    const { ext, contentType } = uploadInfo;
    const filePath = `${user.id}/${Date.now()}-business-registration.${ext}`;

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
      .from('store-verification-docs')
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

      setMessage('사업자번호 1차 확인이 완료되었습니다. 등록증을 첨부하고 인증을 신청해 주세요.');
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
      const cleanBusinessNumber = businessNumber.replace(/[^0-9]/g, '');
      const canReuseBusinessCheck =
        latestStoreRequest?.business_number === cleanBusinessNumber &&
        ['pending', 'needs_more_info'].includes(latestStoreRequest.status);

      if (!businessNumber.trim()) {
        setMessage('사업자등록번호를 입력해 주세요.');
        return;
      }

      if (!phone.trim()) {
        setMessage('대표 전화번호를 입력해 주세요.');
        return;
      }

      if (!businessVerified && !canReuseBusinessCheck) {
        setMessage('사업자번호 1차 확인을 먼저 진행해 주세요.');
        return;
      }

      if (!businessDocumentPath && !selectedBusinessDocumentAsset) {
        setMessage('사업자등록증 파일을 업로드해 주세요.');
        return;
      }
      if (
        !sellerTaxPolicyAgreed ||
        !businessIdentityPolicyAgreed ||
        !storeRestrictionPolicyAgreed
      ) {
        setMessage('가게 인증 신청을 위해 판매자 의무 및 인증 정책에 모두 동의해 주세요.');
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

      if (userType === 'store' && businessVerified && storeVerificationStatus === 'approved') {
        const { error } = await supabase
          .from('profiles')
          .update({
            user_type: 'store',
            display_name: displayName.trim(),
            email: email.trim() || null,
            phone: phone.trim(),
            is_phone_public: isPhonePublic,
            avatar_path: nextAvatarPath,
            store_address: storeAddress.trim() || null,
            store_latitude: storeLatitude,
            store_longitude: storeLongitude,
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
        return;
      }

      if (userType === 'store') {
        let nextBusinessDocumentPath = businessDocumentPath;

        if (selectedBusinessDocumentAsset) {
          nextBusinessDocumentPath = await uploadBusinessDocument(
            selectedBusinessDocumentAsset
          );
        }

        if (!nextBusinessDocumentPath) {
          setMessage('사업자등록증 파일을 업로드해 주세요.');
          return;
        }

        const nextBusinessDocumentMimeType =
          businessDocumentMimeType ||
          getBusinessDocumentMimeTypeFromPath(nextBusinessDocumentPath);
        const requestPayload = {
          p_business_number: businessNumber.replace(/[^0-9]/g, ''),
          p_store_name: displayName.trim(),
          p_representative_name: representativeName.trim() || null,
          p_phone: phone.trim(),
          p_store_address: storeAddress.trim() || null,
          p_store_latitude: storeLatitude,
          p_store_longitude: storeLongitude,
          p_document_path: nextBusinessDocumentPath,
          p_seller_tax_policy_agreed: sellerTaxPolicyAgreed,
          p_business_identity_policy_agreed: businessIdentityPolicyAgreed,
          p_store_restriction_policy_agreed: storeRestrictionPolicyAgreed,
        };
        let requestResult = await supabase.rpc(
          'submit_store_verification_request',
          {
            ...requestPayload,
            p_document_mime_type: nextBusinessDocumentMimeType,
          }
        );

        if (
          requestResult.error &&
          requestResult.error.message.includes('p_document_mime_type')
        ) {
          requestResult = await supabase.rpc(
            'submit_store_verification_request',
            requestPayload
          );
        }

        if (requestResult.error) {
          const rawMessage = requestResult.error.message || '';

          if (
            rawMessage.includes('duplicate key value') ||
            rawMessage.includes('store_verification_requests_active_business_number_idx')
          ) {
            setMessage('이미 신청 중이거나 승인된 사업자등록번호입니다. 기존 신청 상태를 확인해 주세요.');
            return;
          }

          setMessage(rawMessage);
          return;
        }

        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({
            email: email.trim() || null,
            avatar_path: nextAvatarPath,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileUpdateError) {
          setMessage(profileUpdateError.message);
          return;
        }

        setLatestStoreRequest((requestResult.data || null) as StoreVerificationRequest | null);
        setStoreVerificationStatus('pending');
        setBusinessDocumentPath(nextBusinessDocumentPath);
        setBusinessDocumentMimeType(nextBusinessDocumentMimeType);
        setSelectedBusinessDocumentAsset(null);
        setBusinessDocumentPreviewUri(null);
        setAvatarPath(nextAvatarPath);
        setSelectedAvatarAsset(null);
        setAvatarPreviewUri(null);
        setBusinessVerified(true);
        setMessage('가게 인증 신청이 접수되었습니다. 관리자가 검수한 뒤 인증 뱃지가 표시됩니다.');
        return;
      }

      if (
        latestStoreRequest?.status === 'pending' ||
        latestStoreRequest?.status === 'needs_more_info'
      ) {
        const { error: cancelError } = await supabase.rpc(
          'cancel_store_verification_request'
        );

        if (cancelError) {
          setMessage(cancelError.message);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          user_type: 'personal',
          display_name: displayName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          is_phone_public: false,
          avatar_path: nextAvatarPath,
          store_address: null,
          store_latitude: null,
          store_longitude: null,
          business_number: null,
          business_verified: false,
          business_verified_at: null,
          store_verification_status: 'none',
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
      setLatestStoreRequest(null);
      setStoreVerificationStatus('none');
      setBusinessDocumentPath(null);
      setBusinessDocumentMimeType(null);
      setBusinessDocumentName('');
      setSelectedBusinessDocumentAsset(null);
      setBusinessDocumentPreviewUri(null);
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
              setRepresentativeName('');
              setBusinessDocumentPath(null);
              setSellerTaxPolicyAgreed(false);
              setBusinessIdentityPolicyAgreed(false);
              setStoreRestrictionPolicyAgreed(false);
              setBusinessDocumentMimeType(null);
              setBusinessDocumentName('');
              setBusinessDocumentPreviewUri(null);
              setSelectedBusinessDocumentAsset(null);
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
              if (storeVerificationStatus !== 'approved') {
                setBusinessVerified(false);
              }
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
            <View style={styles.statusBox}>
              <Text style={styles.statusBoxTitle}>
                {getStoreVerificationStatusLabel(storeVerificationStatus)}
              </Text>
              <Text style={styles.statusBoxText}>
                승인 전에는 가게 인증 뱃지가 표시되지 않습니다. 사업자등록증과 상호,
                대표 전화번호를 관리자가 확인한 뒤 승인됩니다.
              </Text>
              {latestStoreRequest?.admin_note ? (
                <Text style={styles.statusBoxNote}>
                  검수 메모: {latestStoreRequest.admin_note}
                </Text>
              ) : null}
            </View>

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
              editable={storeVerificationStatus !== 'approved'}
            />

            {storeVerificationStatus !== 'approved' ? (
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={handleVerifyBusiness}
                disabled={verifyingBusiness}
              >
                <Text style={styles.verifyBtnText}>
                  {verifyingBusiness ? '사업자 확인 중...' : '사업자번호 1차 확인'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.statusText, businessVerified && styles.successText]}>
              {storeVerificationStatus === 'approved'
                ? '관리자 승인으로 가게 인증이 완료되었습니다.'
                : storeVerificationStatus === 'pending'
                  ? '제출한 사업자 정보가 관리자 검수를 기다리고 있습니다.'
                  : businessVerified
                    ? '사업자번호 1차 확인 완료'
                    : '사업자번호 1차 확인 후 인증 신청을 진행해 주세요.'}
            </Text>

            <Text style={styles.label}>대표자명</Text>
            <TextInput
              style={styles.input}
              value={representativeName}
              onChangeText={setRepresentativeName}
              placeholder="선택 입력"
              editable={storeVerificationStatus !== 'approved'}
            />

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

            {storeVerificationStatus !== 'approved' ? (
              <>
                <Text style={styles.label}>사업자등록증 파일</Text>
                <TouchableOpacity
                  style={styles.documentBtn}
                  onPress={pickBusinessDocument}
                >
                  <Ionicons name="document-attach-outline" size={18} color="#111827" />
                  <Text style={styles.documentBtnText}>
                    {businessDocumentPath || selectedBusinessDocumentAsset
                      ? '사업자등록증 다시 선택'
                      : '사업자등록증 선택'}
                  </Text>
                </TouchableOpacity>

                {businessDocumentPreviewUri ? (
                  <Image
                    source={{ uri: businessDocumentPreviewUri }}
                    style={styles.documentPreview}
                  />
                ) : selectedBusinessDocumentAsset ? (
                  <View style={styles.documentFileBox}>
                    <Ionicons name="document-text-outline" size={22} color="#2563eb" />
                    <Text style={styles.documentFileText} numberOfLines={2}>
                      {businessDocumentName || '선택한 사업자등록증 파일'}
                    </Text>
                  </View>
                ) : businessDocumentPath ? (
                  <Text style={styles.statusText}>
                    기존 제출 서류가 있습니다.
                    {businessDocumentMimeType === 'application/pdf' ? ' PDF 파일입니다.' : ''}
                  </Text>
                ) : (
                  <Text style={styles.statusText}>
                    PDF, JPG, PNG, WEBP 파일을 업로드할 수 있습니다.
                  </Text>
                )}
                <View style={styles.agreementBox}>
                  <Text style={styles.agreementTitle}>가게 판매자 확인사항</Text>

                  <TouchableOpacity
                    style={styles.agreementRow}
                    onPress={() => setSellerTaxPolicyAgreed((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={sellerTaxPolicyAgreed ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={sellerTaxPolicyAgreed ? '#2563eb' : '#9ca3af'}
                    />
                    <Text style={styles.agreementText}>
                      사업자 판매자로서 관련 법령, 세금 신고, 현금영수증/세금계산서 발급 등 의무를 직접 이행해야 함을 확인했습니다.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.agreementRow}
                    onPress={() => setBusinessIdentityPolicyAgreed((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={businessIdentityPolicyAgreed ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={businessIdentityPolicyAgreed ? '#2563eb' : '#9ca3af'}
                    />
                    <Text style={styles.agreementText}>
                      타인의 사업자등록번호 또는 사업자등록증을 무단으로 사용할 경우 가게 인증 취소 및 이용 제한될 수 있음을 확인했습니다.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.agreementRow}
                    onPress={() => setStoreRestrictionPolicyAgreed((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={storeRestrictionPolicyAgreed ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={storeRestrictionPolicyAgreed ? '#2563eb' : '#9ca3af'}
                    />
                    <Text style={styles.agreementText}>
                      회사는 허위 등록, 도용, 신고 누적, 불법 거래 의심 시 가게 인증을 취소하거나 판매를 제한할 수 있음을 확인했습니다.
                    </Text>
                  </TouchableOpacity>
                </View>
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
          editable={!(userType === 'store' && storeVerificationStatus === 'approved')}
        />

        <Text style={styles.label}>
          {userType === 'store' ? '대표 전화번호' : '전화번호'}
        </Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="01012345678"
          keyboardType="phone-pad"
          editable={!(userType === 'store' && storeVerificationStatus === 'approved')}
        />

        <Text style={styles.label}>이메일</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {userType === 'store' && storeVerificationStatus === 'approved' && (
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
            {loading
              ? '저장 중...'
              : userType === 'store' && storeVerificationStatus !== 'approved'
                ? '가게 인증 신청'
                : '저장하기'}
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

  agreementBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    padding: 14,
    gap: 12,
  },

  agreementTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },

  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  agreementText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
    fontWeight: '600',
  },

  statusBox: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    padding: 14,
    gap: 6,
  },

  statusBoxTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1d4ed8',
  },

  statusBoxText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },

  statusBoxNote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#b45309',
  },

  documentBtn: {
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

  documentBtnText: {
    color: '#111827',
    fontWeight: '800',
  },

  documentPreview: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
  },

  documentFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    padding: 14,
  },

  documentFileText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1f2937',
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
