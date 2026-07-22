import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { canUseApp } from '../../lib/guard';
import {
  DISPUTE_POINTS,
  FAST_RESPONSE_POINTS,
  POSITIVE_REVIEW_POINTS,
  REPEATED_CANCELLATION_POINTS,
} from '../../lib/sellerLevel';
import { supabase } from '../../lib/supabase';

type ReviewSentiment = 'positive' | 'negative';

type ReviewTag = {
  id: string;
  label: string;
  points?: number;
};

const positiveTags: ReviewTag[] = [
  { id: 'fast_response', label: '응답이 빨라요', points: FAST_RESPONSE_POINTS },
  { id: 'kind', label: '친절해요' },
  { id: 'kept_promise', label: '약속을 잘 지켜요' },
  { id: 'accurate_item', label: '상품 설명이 정확해요' },
];

const negativeTags: ReviewTag[] = [
  { id: 'slow_response', label: '연락이 느렸어요' },
  { id: 'schedule_issue', label: '약속 시간이 맞지 않아요' },
  { id: 'item_mismatch', label: '상품 상태가 달랐어요', points: DISPUTE_POINTS },
  { id: 'deal_canceled', label: '거래가 취소됐어요', points: REPEATED_CANCELLATION_POINTS },
  { id: 'other', label: '기타' },
];

function formatPoint(points: number) {
  if (points > 0) return `+${points}점`;
  return `${points}점`;
}

export default function ReviewCreateScreen() {
  const params = useLocalSearchParams<{
    listingId?: string;
    targetUserId?: string;
    saleId?: string;
    roomId?: string;
  }>();

  const listingId = Array.isArray(params.listingId)
    ? params.listingId[0]
    : params.listingId;

  const targetUserId = Array.isArray(params.targetUserId)
    ? params.targetUserId[0]
    : params.targetUserId;

  const saleId = Array.isArray(params.saleId) ? params.saleId[0] : params.saleId;
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  const [loading, setLoading] = useState(false);
  const [targetProfile, setTargetProfile] = useState<any | null>(null);
  const [sentiment, setSentiment] = useState<ReviewSentiment>('positive');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);

  const activeTags = sentiment === 'positive' ? positiveTags : negativeTags;
  const isStoreReview =
    targetProfile?.user_type === 'store' && !!targetProfile?.business_verified;
  const pointPreview =
    (sentiment === 'positive' ? POSITIVE_REVIEW_POINTS : 0) +
    (selectedTags.includes('fast_response') ? FAST_RESPONSE_POINTS : 0) +
    (selectedTags.includes('item_mismatch') ? DISPUTE_POINTS : 0) +
    (selectedTags.includes('deal_canceled') ? REPEATED_CANCELLATION_POINTS : 0);

  const showAlertAndBack = (title: string, message = '') => {
    if (Platform.OS === 'web') {
      window.alert(message ? `${title}\n${message}` : title);
      router.back();
      return;
    }

    Alert.alert(title, message, [
      {
        text: '확인',
        onPress: () => router.back(),
      },
    ]);
  };

  const showAlert = (title: string, message = '') => {
    if (Platform.OS === 'web') {
      window.alert(message ? `${title}\n${message}` : title);
      return;
    }

    Alert.alert(title, message);
  };

  useEffect(() => {
    const loadTargetProfile = async () => {
      if (!targetUserId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, user_type, business_verified')
        .eq('id', targetUserId)
        .maybeSingle();

      if (error) {
        console.log('후기 대상 프로필 조회 실패:', error);
        return;
      }

      setTargetProfile(data || null);
    };

    void loadTargetProfile();
  }, [targetUserId]);

  const pickReviewImages = async () => {
    const remain = 5 - imageUris.length;
    if (remain <= 0) {
      showAlert('사진 첨부', '가게 후기는 사진을 최대 5장까지 첨부할 수 있습니다.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showAlert('사진 권한 필요', '후기 사진을 첨부하려면 사진 접근 권한이 필요합니다.');
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
      setImageUris((prev) => [
        ...prev,
        ...result.assets.map((asset) => asset.uri),
      ].slice(0, 5));
    }
  };

  const uploadReviewImage = async (
    reviewId: string,
    reviewerId: string,
    uri: string,
    sortOrder: number
  ) => {
    const filePath = `${reviewerId}/${reviewId}/${Date.now()}-${sortOrder}.jpg`;
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
      .from('review-images')
      .upload(filePath, uploadData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase.from('review_images').insert({
      review_id: reviewId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (rowError) throw rowError;
  };

  const selectSentiment = (nextSentiment: ReviewSentiment) => {
    setSentiment(nextSentiment);
    setSelectedTags([]);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((item) => item !== tagId)
        : [...prev, tagId]
    );
  };

  const submitReview = async () => {
    if (loading) return;

    if (selectedTags.length === 0) {
      showAlert('후기 항목 선택', '거래 경험에 맞는 항목을 하나 이상 선택해 주세요.');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.log('authError:', authError);
        showAlert('로그인 확인 실패', authError.message);
        return;
      }

      const me = authData.user?.id;

      if (!me) {
        showAlert('로그인이 필요합니다.');
        router.push('/login' as any);
        return;
      }

      const guard = await canUseApp();

      if (!guard.ok) {
        showAlert('후기 작성 제한', guard.reason || '현재 후기를 작성할 수 없습니다.');
        return;
      }

      if (!targetUserId || !listingId) {
        showAlert('후기 정보가 없습니다.');
        return;
      }

      if (me === targetUserId) {
        showAlert('본인에게는 후기를 남길 수 없습니다.');
        return;
      }

      const normalizedListingId = Number(listingId);
      const normalizedTargetUserId = String(targetUserId);
      const saleIdNumber = saleId ? Number(saleId) : null;
      const normalizedSaleId =
        saleIdNumber && Number.isInteger(saleIdNumber) && saleIdNumber > 0
          ? saleIdNumber
          : null;

      if (!Number.isInteger(normalizedListingId) || normalizedListingId <= 0) {
        showAlert('후기 정보가 올바르지 않습니다.');
        return;
      }

      if (!normalizedSaleId) {
        showAlertAndBack(
          '후기 작성 불가',
          '거래완료 처리된 거래에만 후기를 남길 수 있습니다.'
        );
        return;
      }

      const { data: existingReview, error: checkError } = await supabase
        .from('reviews')
        .select('id')
        .eq('reviewer_id', me)
        .eq('target_user_id', normalizedTargetUserId)
        .eq('sale_id', normalizedSaleId)
        .maybeSingle();

      if (checkError) {
        showAlert('후기 확인 실패', checkError.message);
        return;
      }

      if (existingReview) {
        showAlertAndBack(
          '이미 후기 작성 완료',
          normalizedSaleId
            ? '이 추가 거래에 대한 후기는 이미 작성했습니다.'
            : '이 거래에 대한 후기는 이미 작성했습니다.'
        );
        return;
      }

      const { data: createdReview, error } = await supabase
        .from('reviews')
        .insert({
          listing_id: normalizedListingId,
          sale_id: normalizedSaleId,
          reviewer_id: me,
          target_user_id: normalizedTargetUserId,
          rating: sentiment === 'positive' ? 5 : 2,
          sentiment,
          feedback_tags: selectedTags,
          comment: comment.trim() || null,
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505') {
          showAlertAndBack(
            '이미 후기 작성 완료',
            normalizedSaleId
              ? '이 추가 거래에 대한 후기는 이미 작성했습니다.'
              : '이 거래에 대한 후기는 이미 작성했습니다.'
          );
          return;
        }

        showAlert('후기 저장 실패', error.message);
        return;
      }

      if (isStoreReview && createdReview?.id && imageUris.length > 0) {
        for (let i = 0; i < imageUris.length; i += 1) {
          await uploadReviewImage(String(createdReview.id), me, imageUris[i], i);
        }
      }

      try {
        const { error: notificationError } = await supabase.functions.invoke(
          'send-review-notification',
          {
            body: {
              reviewId: createdReview?.id,
              listingId: normalizedListingId,
              saleId: normalizedSaleId,
              roomId: roomId || null,
              reviewerId: me,
              targetUserId: normalizedTargetUserId,
              sentiment,
            },
          }
        );

        if (notificationError) {
          console.log('후기 알림 전송 실패:', notificationError);
        }
      } catch (notificationException) {
        console.log('후기 알림 호출 실패:', notificationException);
      }

      showAlertAndBack('후기 작성 완료');
    } catch (e: any) {
      console.log('후기 작성 중 예외:', e);
      showAlert('오류', e?.message || '후기 작성 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerIcon}>
        <Ionicons name="ribbon-outline" size={32} color="#166534" />
      </View>

      <Text style={styles.title}>거래 후기를 남겨요</Text>
      <Text style={styles.desc}>
        선택한 항목에 따라 판매자 레벨 점수가 자동으로 반영됩니다.
      </Text>

      <View style={styles.segment}>
        {[
          { id: 'positive' as const, label: '좋았어요', icon: 'thumbs-up-outline' as const },
          { id: 'negative' as const, label: '아쉬웠어요', icon: 'thumbs-down-outline' as const },
        ].map((item) => {
          const active = sentiment === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => selectSentiment(item.id)}
            >
              <Ionicons name={item.icon} size={18} color={active ? '#fff' : '#4b5563'} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {sentiment === 'positive' ? '좋았던 점' : '아쉬웠던 점'}
        </Text>

        <View style={styles.tagWrap}>
          {activeTags.map((tag) => {
            const active = selectedTags.includes(tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                style={[styles.tagBtn, active && styles.tagBtnActive]}
                onPress={() => toggleTag(tag.id)}
              >
                <Text style={[styles.tagText, active && styles.tagTextActive]}>
                  {tag.label}
                </Text>
                {tag.points ? (
                  <Text style={[styles.tagPoint, active && styles.tagPointActive]}>
                    {formatPoint(tag.points)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>한마디</Text>
        <TextInput
          style={styles.commentInput}
          value={comment}
          onChangeText={setComment}
          placeholder="거래 후기를 짧게 남겨주세요."
          placeholderTextColor="#9ca3af"
          maxLength={120}
        />
      </View>

      {isStoreReview ? (
        <View style={styles.section}>
          <View style={styles.photoHeader}>
            <Text style={styles.sectionTitle}>가게 후기 사진</Text>
            <TouchableOpacity style={styles.photoAddBtn} onPress={pickReviewImages}>
              <Ionicons name="image-outline" size={16} color="#166534" />
              <Text style={styles.photoAddText}>추가</Text>
            </TouchableOpacity>
          </View>
          {imageUris.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {imageUris.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.photoPreviewBox}>
                  <Image source={{ uri }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() =>
                      setImageUris((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.photoHelp}>
              시공 결과나 자재 상태 사진을 첨부하면 가게 프로필 후기에서 함께 보입니다.
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.pointBox}>
        <Text style={styles.pointLabel}>이번 후기 점수</Text>
        <Text style={[styles.pointText, pointPreview < 0 && styles.pointTextNegative]}>
          {formatPoint(pointPreview)}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={submitReview}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? '저장중...' : '후기 남기기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 34,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  desc: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 21,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  segmentBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  segmentBtnActive: {
    backgroundColor: '#2563eb',
  },
  segmentText: {
    color: '#4b5563',
    fontWeight: '900',
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#fff',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  tagText: {
    color: '#374151',
    fontWeight: '800',
    fontSize: 13,
  },
  tagTextActive: {
    color: '#1d4ed8',
  },
  tagPoint: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  tagPointActive: {
    color: '#1d4ed8',
  },
  commentInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  photoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  photoAddText: { color: '#2563eb', fontSize: 13, fontWeight: '900' },
  photoRow: { gap: 10 },
  photoPreviewBox: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  photoPreview: { width: '100%', height: '100%' },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17,24,39,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHelp: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  pointBox: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointLabel: {
    color: '#1f2937',
    fontWeight: '900',
  },
  pointText: {
    color: '#2563eb',
    fontWeight: '900',
    fontSize: 18,
  },
  pointTextNegative: {
    color: '#dc2626',
  },
  btn: {
    marginTop: 22,
    backgroundColor: '#2563eb',
    minHeight: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
});
