import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMyActiveRegion } from '../lib/active_region';
import { canCreateListing, canUseApp } from '../lib/guard';
import {
  sendFavoriteListingUpdate,
  sendKeywordAlertsForListing,
} from '../lib/listingNotifications';
import { checkProhibitedContent } from '../lib/prohibited';
import { supabase } from '../lib/supabase';

type ListingCategory = 'trade' | 'share' | 'want';
type ListingStatus = 'active' | 'reserved' | 'done';
type FormMode = 'create' | 'edit';

type Props = {
  mode: FormMode;
  listingId?: number | null;
  createReturnTo?: string;
  createRedirectTo?: string;
};

type ExistingImage = {
  id: number;
  image_path: string;
  sort_order: number | null;
};

const DRAFT_KEY = 'listing_form_draft';
const MAX_DISTANCE_KM = 30;
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

const CATEGORY_OPTIONS: {
  id: ListingCategory;
  label: string;
  desc: string;
}[] = [
  { id: 'trade', label: '판매', desc: '가격을 받고 거래해요' },
  { id: 'share', label: '나눔', desc: '무료로 나눠요' },
  { id: 'want', label: '구함', desc: '필요한 자재를 찾아요' },
];

function normalizeParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCategory(value?: string | string[]): ListingCategory {
  const category = normalizeParam(value);
  if (category === 'share' || category === 'want') return category;
  return 'trade';
}

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
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
}

function formatTradePrice(text: string) {
  const onlyNumber = text.replace(/[^0-9]/g, '');
  if (!onlyNumber) return '';
  return `${Number(onlyNumber).toLocaleString('ko-KR')}원`;
}

function showListingFormAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

export default function ListingForm({
  mode,
  listingId,
  createReturnTo = '/(tabs)/home/create',
  createRedirectTo = '/(tabs)/home',
}: Props) {
  const params = useLocalSearchParams<{
    category?: string;
    lat?: string;
    lng?: string;
    regionChanged?: string;
    regionName?: string;
    regionLat?: string;
    regionLng?: string;
  }>();

  const isEdit = mode === 'edit';
  const draftKey = isEdit && listingId ? `${DRAFT_KEY}_edit_${listingId}` : DRAFT_KEY;
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [post, setPost] = useState<any | null>(null);

  const [category, setCategory] = useState<ListingCategory>(() =>
    normalizeCategory(params.category)
  );
  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [quantityRemainingText, setQuantityRemainingText] = useState('1');
  const [quantityUnit, setQuantityUnit] = useState('개');
  const [customQuantityUnit, setCustomQuantityUnit] = useState('');
  const [description, setDescription] = useState('');
  const [detailLocation, setDetailLocation] = useState('');
  const [status, setStatus] = useState<ListingStatus>('active');
  const [urgent, setUrgent] = useState(false);
  const [availableNow, setAvailableNow] = useState(false);
  const [availableToday, setAvailableToday] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<any | null>(null);
  const [isStoreProduct, setIsStoreProduct] = useState(false);
  const [pickupAvailable, setPickupAvailable] = useState(true);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [cashReceiptAvailable, setCashReceiptAvailable] = useState(false);
  const [taxInvoiceAvailable, setTaxInvoiceAvailable] = useState(false);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [activeRegionName, setActiveRegionName] = useState('');
  const [activeRegionLat, setActiveRegionLat] = useState<number | null>(null);
  const [activeRegionLng, setActiveRegionLng] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const showImages = category !== 'want';
  const isTrade = category === 'trade';
  const isShare = category === 'share';
  const isWant = category === 'want';
  const isStoreSeller =
    currentProfile?.user_type === 'store' && !!currentProfile?.business_verified;
  const categoryLabel = isTrade ? '판매' : isShare ? '나눔' : '구함';
  const quantityPlaceholder = isTrade ? '판매 수량' : isShare ? '나눔 수량' : '구하는 수량';
  const titlePlaceholder = isWant ? '구하는 자재명' : '제목';

  const existingImageUrls = useMemo(() => {
    return existingImages
      .filter((image) => !deletedImageIds.includes(image.id))
      .map((image) => {
        const { data } = supabase.storage
          .from('listing-images')
          .getPublicUrl(image.image_path);

        return {
          ...image,
          url: data.publicUrl,
        };
      });
  }, [existingImages, deletedImageIds]);

  const distanceFromRegion =
    !isEdit &&
    activeRegionLat != null &&
    activeRegionLng != null &&
    latitude != null &&
    longitude != null
      ? getDistanceKm(activeRegionLat, activeRegionLng, latitude, longitude)
      : null;

  const isTooFarFromRegion =
    distanceFromRegion != null && distanceFromRegion > MAX_DISTANCE_KM;

  useEffect(() => {
    if (isEdit) return;

    setCategory(normalizeCategory(params.category));
  }, [isEdit, params.category]);

  useEffect(() => {
    if (isEdit) {
      void fetchPost();
      return;
    }

    void initCreateForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, listingId]);

  useEffect(() => {
    if (isEdit) return;
    if (!params.regionChanged) return;

    if (params.regionName) {
      setActiveRegionName(String(params.regionName));
      setActiveRegionLat(params.regionLat ? Number(params.regionLat) : null);
      setActiveRegionLng(params.regionLng ? Number(params.regionLng) : null);
      return;
    }

    void loadActiveRegion();
  }, [
    isEdit,
    params.regionChanged,
    params.regionName,
    params.regionLat,
    params.regionLng,
  ]);

  useEffect(() => {
    if (params.lat && params.lng) {
      setLatitude(Number(params.lat));
      setLongitude(Number(params.lng));
      setSuccessMessage('거래 희망 장소가 선택되었습니다.');
    }
  }, [params.lat, params.lng]);

  const initCreateForm = async () => {
    await loadCurrentProfile();
    const hasDraft = await loadDraft();

    if (!params.regionName) {
      await loadActiveRegion();
    }

    if (!hasDraft && (!params.lat || !params.lng)) {
      await initDefaultLocation();
    }
  };

  const fetchPost = async () => {
    if (!listingId) {
      showListingFormAlert('오류', '게시글 정보를 찾을 수 없습니다.');
      router.back();
      return;
    }

    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id;
    await loadCurrentProfile();

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('id', listingId)
      .single();

    if (error || !data) {
      showListingFormAlert('오류', '게시글을 불러오지 못했습니다.');
      router.back();
      return;
    }

    if (!currentUserId || data.author_id !== currentUserId) {
      showListingFormAlert('권한 없음', '본인 게시글만 수정할 수 있습니다.');
      router.back();
      return;
    }

    const sortedImages = [...(data.listing_images || [])].sort(
      (a: ExistingImage, b: ExistingImage) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    const initialCategory =
      data.category === 'share' || data.category === 'want' ? data.category : 'trade';

    setPost(data);
    setCategory(initialCategory);
    setTitle(data.title || '');
    setPriceText(data.price_text || '');
    setQuantityText(String(data.quantity_total ?? 1));
    setQuantityRemainingText(
      String(data.quantity_remaining ?? (data.status === 'done' ? 0 : data.quantity_total ?? 1))
    );
    setQuantityUnit(data.quantity_unit || '개');
    setCustomQuantityUnit('');
    setDescription(data.description || '');
    setDetailLocation(data.detail_location || '');
    setStatus(data.status || 'active');
    setUrgent(!!data.urgent);
    setAvailableNow(!!data.available_now);
    setAvailableToday(!!data.available_today);
    setIsStoreProduct(!!data.is_store_product);
    setPickupAvailable(data.pickup_available !== false);
    setDeliveryAvailable(!!data.delivery_available);
    setCardAvailable(!!data.card_available);
    setCashReceiptAvailable(!!data.cash_receipt_available);
    setTaxInvoiceAvailable(!!data.tax_invoice_available);
    setVatIncluded(data.vat_included !== false);
    setActiveRegionName(data.region || '');
    setLatitude(params.lat ? Number(params.lat) : data.latitude ?? null);
    setLongitude(params.lng ? Number(params.lng) : data.longitude ?? null);
    setExistingImages(sortedImages);
    setDeletedImageIds([]);
    setImageUris([]);

    if (params.lat || params.lng) {
      await loadDraft();
    }

    setLoading(false);
  };

  const loadCurrentProfile = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id;

    if (!currentUserId) {
      setCurrentProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUserId)
      .maybeSingle();

    if (error) {
      console.log('작성자 프로필 조회 실패:', error);
      return null;
    }

    setCurrentProfile(data || null);

    if (!isEdit && data?.user_type === 'store' && data?.business_verified) {
      setIsStoreProduct(true);
      setPickupAvailable(true);
      setCardAvailable(!!data.store_card_available);
      setCashReceiptAvailable(!!data.store_cash_receipt_available);
      setTaxInvoiceAvailable(!!data.store_tax_invoice_available);
      setAvailableToday(!!data.store_today_available);
    }

    return data || null;
  };

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

  const saveDraft = async () => {
    await AsyncStorage.setItem(
      draftKey,
      JSON.stringify({
        category,
        title,
        priceText,
        quantityText,
        quantityRemainingText,
        quantityUnit,
        customQuantityUnit,
        description,
        detailLocation,
        urgent,
        availableNow,
        availableToday,
        isStoreProduct,
        pickupAvailable,
        deliveryAvailable,
        cardAvailable,
        cashReceiptAvailable,
        taxInvoiceAvailable,
        vatIncluded,
        activeRegionName,
        activeRegionLat,
        activeRegionLng,
        latitude,
        longitude,
        imageUris,
        deletedImageIds,
      })
    );
  };

  const loadDraft = async () => {
    try {
      const saved = await AsyncStorage.getItem(draftKey);
      if (!saved) return false;

      const draft = JSON.parse(saved);

      setCategory(normalizeCategory(params.category || draft.category));
      setTitle(draft.title || '');
      setPriceText(draft.priceText || '');
      setQuantityText(draft.quantityText || '1');
      setQuantityRemainingText(draft.quantityRemainingText || '1');
      setQuantityUnit(draft.quantityUnit || '개');
      setCustomQuantityUnit(draft.customQuantityUnit || '');
      setDescription(draft.description || '');
      setDetailLocation(draft.detailLocation || '');
      setUrgent(!!draft.urgent);
      setAvailableNow(!!draft.availableNow);
      setAvailableToday(!!draft.availableToday);
      if (typeof draft.isStoreProduct === 'boolean') {
        setIsStoreProduct(draft.isStoreProduct);
      }
      if (typeof draft.pickupAvailable === 'boolean') {
        setPickupAvailable(draft.pickupAvailable);
      }
      if (typeof draft.deliveryAvailable === 'boolean') {
        setDeliveryAvailable(draft.deliveryAvailable);
      }
      if (typeof draft.cardAvailable === 'boolean') {
        setCardAvailable(draft.cardAvailable);
      }
      if (typeof draft.cashReceiptAvailable === 'boolean') {
        setCashReceiptAvailable(draft.cashReceiptAvailable);
      }
      if (typeof draft.taxInvoiceAvailable === 'boolean') {
        setTaxInvoiceAvailable(draft.taxInvoiceAvailable);
      }
      if (typeof draft.vatIncluded === 'boolean') {
        setVatIncluded(draft.vatIncluded);
      }
      setActiveRegionName(draft.activeRegionName || '');
      setActiveRegionLat(draft.activeRegionLat ?? null);
      setActiveRegionLng(draft.activeRegionLng ?? null);
      setImageUris(draft.imageUris || []);
      setDeletedImageIds(draft.deletedImageIds || []);

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

  const getFinalQuantityUnit = () => {
    if (quantityUnit === '기타') {
      return customQuantityUnit.trim();
    }

    return quantityUnit;
  };

  const pickImages = async () => {
    try {
      setErrorMessage('');
      setSuccessMessage('');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage('사진을 선택하려면 사진 접근 권한이 필요합니다.');
        return;
      }

      const currentCount = existingImageUrls.length + imageUris.length;
      const remain = Math.max(0, 10 - currentCount);

      if (remain < 1) {
        setErrorMessage('사진은 최대 10장까지 올릴 수 있습니다.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remain,
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
    targetListingId: number,
    uri: string,
    sortOrder: number
  ) => {
    const filePath = `listing-${targetListingId}/${Date.now()}-${sortOrder}.jpg`;

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

    if (uploadError) throw uploadError;

    const { error: imageRowError } = await supabase.from('listing_images').insert({
      listing_id: targetListingId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (imageRowError) throw imageRowError;
  };

  const openMapPicker = async () => {
    await saveDraft();

    router.push({
      pathname: '/map-picker',
      params: {
        lat: String(latitude ?? 37.5665),
        lng: String(longitude ?? 126.9780),
        returnTo: isEdit ? `/(tabs)/home/post/edit/${listingId}` : createReturnTo,
        category,
      },
    } as any);
  };

  const openRegionSelector = async () => {
    await saveDraft();

    router.push({
      pathname: '/(tabs)/home/regions',
      params: {
        returnTo: createReturnTo,
        mode: 'select',
        category,
      },
    } as any);
  };

  const validate = () => {
    if (!title.trim()) {
      return isWant ? '구하는 자재명을 입력해 주세요.' : '제목을 입력해 주세요.';
    }

    if (isTrade && !priceText.trim()) {
      return '가격을 입력해 주세요.';
    }

    const quantityTotal = Number(quantityText);

    if (!Number.isInteger(quantityTotal) || quantityTotal < 1) {
      return `${quantityPlaceholder}은 1개 이상 입력해 주세요.`;
    }

    if (isEdit) {
      const rawQuantityRemaining = Number(quantityRemainingText);

      if (!Number.isInteger(rawQuantityRemaining) || rawQuantityRemaining < 0) {
        return '남은 수량은 0개 이상 입력해 주세요.';
      }

      if (status !== 'done' && rawQuantityRemaining < 1) {
        return '남은 수량이 0개이면 상태를 완료로 바꿔 주세요.';
      }

      if (rawQuantityRemaining > quantityTotal) {
        return '남은 수량은 전체 수량보다 클 수 없습니다.';
      }
    }

    const finalQuantityUnit = getFinalQuantityUnit();

    if (!finalQuantityUnit) {
      return '수량 단위를 선택하거나 직접 입력해 주세요.';
    }

    if (finalQuantityUnit.length > 10) {
      return '수량 단위는 10자 이내로 입력해 주세요.';
    }

    if (latitude == null || longitude == null) {
      return '거래 희망 장소를 지도에서 선택해 주세요.';
    }

    if (isTooFarFromRegion) {
      return '거래 장소와 가까운 동네로 대표 동네를 변경해 주세요.';
    }

    const blockedKeyword = checkProhibitedContent(
      title,
      priceText,
      description,
      detailLocation
    );

    if (blockedKeyword) {
      return `"${blockedKeyword}" 관련 판매금지 물품은 등록하거나 수정할 수 없습니다.`;
    }

    return null;
  };

  const buildListingPayload = (authorId?: string) => {
    const quantityTotal = Number(quantityText);
    const rawQuantityRemaining = isEdit
      ? Number(quantityRemainingText)
      : quantityTotal;
    const quantityRemaining = isEdit && status === 'done' ? 0 : rawQuantityRemaining;
    const quantitySold = Math.max(0, quantityTotal - quantityRemaining);
    const finalPriceText = isShare
      ? '무료 나눔'
      : priceText.trim() || null;
    const storeSeller =
      isStoreSeller || post?.seller_type === 'store' || Boolean(post?.store_user_id);
    const storeUserId = storeSeller ? authorId || post?.store_user_id || post?.author_id : null;

    return {
      ...(authorId ? { author_id: authorId } : {}),
      seller_type: storeSeller ? 'store' : 'personal',
      store_user_id: storeUserId,
      is_store_product: storeSeller ? isStoreProduct : false,
      category,
      title: title.trim(),
      price_text: finalPriceText,
      region: activeRegionName,
      latitude,
      longitude,
      detail_location: detailLocation.trim() || null,
      description: description.trim() || null,
      urgent: !isWant && urgent,
      available_now: !isWant && availableNow,
      available_today: !isWant && availableToday,
      pickup_available: storeSeller ? pickupAvailable : false,
      delivery_available: storeSeller ? deliveryAvailable : false,
      card_available: storeSeller ? cardAvailable : false,
      cash_receipt_available: storeSeller ? cashReceiptAvailable : false,
      tax_invoice_available: storeSeller ? taxInvoiceAvailable : false,
      vat_included: storeSeller ? vatIncluded : true,
      status: isEdit ? status : 'active',
      quantity_total: quantityTotal,
      quantity_remaining: quantityRemaining,
      quantity_sold: isEdit ? quantitySold : 0,
      quantity_unit: getFinalQuantityUnit(),
      listing_hidden_previous_status: null,
    };
  };

  const handleCreate = async () => {
    const validationMessage = validate();

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    try {
      setSubmitting(true);

      const { data } = await supabase.auth.getUser();
      const currentUser = data.user;

      if (!currentUser) {
        setErrorMessage('로그인이 필요합니다.');
        return;
      }

      const guard = await canCreateListing();

      if (!guard.ok) {
        setErrorMessage(guard.reason || '게시글 등록이 제한되어 있습니다.');
        return;
      }

      const { data: inserted, error } = await supabase
        .from('listings')
        .insert(buildListingPayload(currentUser.id))
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
        authorId: currentUser.id,
      });

      if (showImages && imageUris.length > 0) {
        for (let i = 0; i < imageUris.length; i += 1) {
          await uploadImageToStorage(inserted.id, imageUris[i], i);
        }
      }

      await AsyncStorage.removeItem(draftKey);
      setSuccessMessage(`${categoryLabel} 글이 등록되었습니다.`);
      router.replace(createRedirectTo as any);
    } catch (e: any) {
      console.log('등록 실패:', e);
      setErrorMessage(e?.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!post) return;

    const validationMessage = validate();

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    try {
      setSubmitting(true);

      const guard = await canUseApp();

      if (!guard.ok) {
        setErrorMessage(guard.reason || '현재 게시글을 수정할 수 없습니다.');
        return;
      }

      const payload = buildListingPayload();
      const priceChanged = post.price_text !== payload.price_text;
      const contentChanged =
        post.category !== payload.category ||
        post.title !== payload.title ||
        (post.description || '') !== (payload.description || '') ||
        (post.detail_location || '') !== (payload.detail_location || '') ||
        post.status !== payload.status ||
        Number(post.quantity_total ?? 1) !== payload.quantity_total ||
        Number(post.quantity_remaining ?? 1) !== payload.quantity_remaining ||
        (post.quantity_unit || '개') !== payload.quantity_unit ||
        post.is_store_product !== payload.is_store_product ||
        post.pickup_available !== payload.pickup_available ||
        post.delivery_available !== payload.delivery_available ||
        post.card_available !== payload.card_available ||
        post.cash_receipt_available !== payload.cash_receipt_available ||
        post.tax_invoice_available !== payload.tax_invoice_available ||
        post.vat_included !== payload.vat_included ||
        post.latitude !== payload.latitude ||
        post.longitude !== payload.longitude;

      const { error: updateError } = await supabase
        .from('listings')
        .update(payload)
        .eq('id', post.id)
        .eq('author_id', post.author_id);

      if (updateError) throw updateError;

      if (priceChanged || contentChanged) {
        await sendFavoriteListingUpdate({
          listingId: post.id,
          authorId: post.author_id,
          title: payload.title,
          changeType: priceChanged ? 'price' : 'content',
          oldPrice: post.price_text,
          newPrice: payload.price_text,
        });
      }

      const shouldDeleteAllImages = category === 'want';
      const deletedImages = existingImages.filter(
        (image) => shouldDeleteAllImages || deletedImageIds.includes(image.id)
      );

      if (deletedImages.length > 0) {
        const deletePaths = deletedImages.map((image) => image.image_path).filter(Boolean);

        if (deletePaths.length > 0) {
          await supabase.storage.from('listing-images').remove(deletePaths);
        }

        const deletedIds = deletedImages.map((image) => image.id);
        const { error: deleteRowError } = await supabase
          .from('listing_images')
          .delete()
          .in('id', deletedIds);

        if (deleteRowError) throw deleteRowError;
      }

      if (showImages && imageUris.length > 0) {
        const remainedCount = existingImages.filter(
          (image) => !deletedImageIds.includes(image.id)
        ).length;

        for (let i = 0; i < imageUris.length; i += 1) {
          await uploadImageToStorage(post.id, imageUris[i], remainedCount + i);
        }
      }

      setSuccessMessage('게시글이 수정되었습니다.');
      await AsyncStorage.removeItem(draftKey);
      router.replace(`/(tabs)/home/post/${post.id}` as any);
    } catch (e: any) {
      console.log('수정 실패:', e);
      setErrorMessage(e?.message || '게시글을 수정하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (submitting) return;
    if (isEdit) {
      void handleEdit();
      return;
    }

    void handleCreate();
  };

  const handleSelectCategory = (nextCategory: ListingCategory) => {
    setCategory(nextCategory);

    if (nextCategory === 'share') {
      setPriceText('무료 나눔');
      return;
    }

    if (nextCategory === 'trade' && priceText === '무료 나눔') {
      setPriceText('');
      return;
    }

    if (nextCategory === 'want' && priceText === '무료 나눔') {
      setPriceText('');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{isEdit ? '게시글 수정' : '게시글 작성'}</Text>

        <View style={styles.categoryRow}>
          {CATEGORY_OPTIONS.map((option) => {
            const active = category === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.categoryBtn, active && styles.categoryBtnActive]}
                onPress={() => handleSelectCategory(option.id)}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {option.label}
                </Text>
                <Text style={[styles.categoryDesc, active && styles.categoryDescActive]}>
                  {option.desc}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {showImages ? (
          <>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImages}>
              <Ionicons name="camera-outline" size={24} color="#6b7280" />
              <Text style={styles.imagePickerText}>
                사진 올리기{' '}
                {existingImageUrls.length + imageUris.length > 0
                  ? `(${existingImageUrls.length + imageUris.length}/10)`
                  : ''}
              </Text>
            </TouchableOpacity>

            {existingImageUrls.length + imageUris.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.thumbnailRow}>
                  {existingImageUrls.map((image) => (
                    <View key={image.id} style={styles.thumbnailWrap}>
                      <Image source={{ uri: image.url }} style={styles.thumbnailImage} />
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() =>
                          setDeletedImageIds((prev) => [...prev, image.id])
                        }
                      >
                        <Text style={styles.removeImageText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

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
                </View>
              </ScrollView>
            ) : null}
          </>
        ) : null}

        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>게시글이 올라갈 동네</Text>
          <Text style={styles.infoValue}>
            {activeRegionName || '대표 동네를 불러오는 중...'}
          </Text>
          <Text style={styles.infoDesc}>
            {isEdit
              ? '수정 화면에서는 기존 게시글 동네를 유지합니다.'
              : '현재 선택된 대표 동네에 게시글이 올라갑니다.'}
          </Text>
        </View>

        <TouchableOpacity style={styles.mapBtn} onPress={openMapPicker}>
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

        {isTooFarFromRegion ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>대표 동네와 거래 장소가 너무 멀어요</Text>
            <Text style={styles.warningText}>
              현재 게시글이 올라갈 동네와 선택한 거래 희망 장소가 약{' '}
              {distanceFromRegion?.toFixed(1)}km 떨어져 있습니다. 거래 장소와 가까운
              동네로 대표 동네를 변경해 주세요.
            </Text>

            <TouchableOpacity style={styles.changeRegionBtn} onPress={openRegionSelector}>
              <Text style={styles.changeRegionBtnText}>대표 동네 바꾸기</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={titlePlaceholder}
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
        />

        {isTrade ? (
          <TextInput
            style={styles.input}
            placeholder="가격"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            value={priceText}
            onChangeText={(value) => setPriceText(formatTradePrice(value))}
          />
        ) : null}

        {isWant ? (
          <TextInput
            style={styles.input}
            placeholder="예산 또는 협의"
            placeholderTextColor="#9ca3af"
            value={priceText}
            onChangeText={setPriceText}
          />
        ) : null}

        <View style={styles.quantityBox}>
          <View style={styles.quantityInputRow}>
            <TextInput
              style={styles.quantityInput}
              placeholder={quantityPlaceholder}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              value={quantityText}
              onChangeText={(value) => setQuantityText(value.replace(/[^0-9]/g, ''))}
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

        {isEdit ? (
          <TextInput
            style={styles.input}
            placeholder="남은 수량"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={quantityRemainingText}
            onChangeText={(value) =>
              setQuantityRemainingText(value.replace(/[^0-9]/g, ''))
            }
          />
        ) : null}

        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="설명"
          placeholderTextColor="#9ca3af"
          multiline
          value={description}
          onChangeText={setDescription}
        />

        {!isWant && isStoreSeller ? (
          <View style={styles.storeOptionsBox}>
            <View>
              <Text style={styles.storeOptionsTitle}>가게 상품 설정</Text>
              <Text style={styles.storeOptionsDesc}>
                가게 인증 상품으로 노출되고 상품 상세에 증빙 가능 여부가 표시됩니다.
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>가게 상품 여부</Text>
              <Switch value={isStoreProduct} onValueChange={setIsStoreProduct} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>방문수령 가능</Text>
              <Switch value={pickupAvailable} onValueChange={setPickupAvailable} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>배송 가능</Text>
              <Switch value={deliveryAvailable} onValueChange={setDeliveryAvailable} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>오늘 수령 가능</Text>
              <Switch value={availableToday} onValueChange={setAvailableToday} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>카드 가능</Text>
              <Switch value={cardAvailable} onValueChange={setCardAvailable} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>현금영수증 가능</Text>
              <Switch value={cashReceiptAvailable} onValueChange={setCashReceiptAvailable} />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>세금계산서 가능</Text>
              <Switch value={taxInvoiceAvailable} onValueChange={setTaxInvoiceAvailable} />
            </View>

            <View style={styles.vatRow}>
              <TouchableOpacity
                style={[styles.vatBtn, vatIncluded && styles.vatBtnActive]}
                onPress={() => setVatIncluded(true)}
              >
                <Text style={[styles.vatBtnText, vatIncluded && styles.vatBtnTextActive]}>
                  부가세 포함
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.vatBtn, !vatIncluded && styles.vatBtnActive]}
                onPress={() => setVatIncluded(false)}
              >
                <Text style={[styles.vatBtnText, !vatIncluded && styles.vatBtnTextActive]}>
                  부가세 별도
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !isWant ? (
          <>
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
          </>
        ) : null}

        {isEdit ? (
          <>
            <Text style={styles.sectionLabel}>상태</Text>
            <View style={styles.statusRow}>
              {[
                { key: 'active', label: '거래중' },
                { key: 'reserved', label: '예약중' },
                { key: 'done', label: isShare ? '나눔완료' : '완료' },
              ].map((option) => {
                const active = status === option.key;

                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.statusBtn, active && styles.statusBtnActive]}
                    onPress={() => setStatus(option.key as ListingStatus)}
                  >
                    <Text style={[styles.statusText, active && styles.statusTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.noticeText}>
          게시글 지역은 대표 동네로 저장되고, 거래 희망 장소는 지도에서 선택한 위치로 저장됩니다.
        </Text>
        <Text style={styles.noticeText}>
          개인 간 거래의 책임은 거래 당사자에게 있으며, 위험 자재나 법령상 제한 물품은 등록할 수 없습니다.
        </Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.btnText}>
            {submitting
              ? isEdit
                ? '저장 중...'
                : '등록 중...'
              : isEdit
                ? '수정 완료'
                : '등록하기'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    color: '#6b7280',
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBtn: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  categoryBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  categoryText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 15,
    textAlign: 'center',
  },
  categoryTextActive: {
    color: '#1d4ed8',
  },
  categoryDesc: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  categoryDescActive: {
    color: '#2563eb',
  },
  imagePicker: {
    height: 150,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    gap: 8,
  },
  imagePickerText: {
    color: '#6b7280',
    fontWeight: '800',
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbnailWrap: {
    width: 92,
    height: 92,
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
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
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
    fontWeight: '800',
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  infoDesc: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
  },
  mapBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mapBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 15,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
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
    color: '#111827',
    fontSize: 15,
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
    fontWeight: '900',
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
  storeOptionsBox: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    padding: 14,
    gap: 10,
  },
  storeOptionsTitle: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '900',
  },
  storeOptionsDesc: {
    marginTop: 4,
    color: '#374151',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  vatRow: {
    flexDirection: 'row',
    gap: 8,
  },
  vatBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  vatBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  vatBtnText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  vatBtnTextActive: {
    color: '#fff',
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  statusText: {
    fontWeight: '900',
    color: '#374151',
  },
  statusTextActive: {
    color: '#fff',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  noticeText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },
  errorText: {
    color: '#dc2626',
    fontWeight: '800',
    lineHeight: 20,
  },
  successText: {
    color: '#16a34a',
    fontWeight: '800',
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
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
    fontWeight: '900',
    fontSize: 16,
  },
});
