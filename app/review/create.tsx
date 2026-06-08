import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ReviewCreateScreen() {
  const params = useLocalSearchParams<{
    listingId?: string;
    targetUserId?: string;
    saleId?: string;
  }>();

  const listingId = Array.isArray(params.listingId)
    ? params.listingId[0]
    : params.listingId;

  const targetUserId = Array.isArray(params.targetUserId)
    ? params.targetUserId[0]
    : params.targetUserId;

  const saleId = Array.isArray(params.saleId) ? params.saleId[0] : params.saleId;

  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(false);

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

  const submitReview = async () => {
    if (loading) return;

    console.log('후기 남기기 클릭', {
      listingId,
      targetUserId,
      rating,
    });

    if (!rating) {
      showAlert('별점을 선택해주세요');
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

      console.log('기존 후기 확인:', existingReview, checkError);

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

      const { error } = await supabase.from('reviews').insert({
        listing_id: normalizedListingId,
        sale_id: normalizedSaleId,
        reviewer_id: me,
        target_user_id: normalizedTargetUserId,
        rating,
      });

      console.log('후기 insert error:', error);

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

      showAlertAndBack('후기 작성 완료');
    } catch (e: any) {
      console.log('후기 작성 중 예외:', e);
      showAlert('오류', e?.message || '후기 작성 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>거래는 어땠나요?</Text>

      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <TouchableOpacity key={i} onPress={() => setRating(i)}>
            <Ionicons
              name={i <= rating ? 'star' : 'star-outline'}
              size={36}
              color="#f59e0b"
            />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={submitReview}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? '저장중...' : '후기 남기기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  starRow: { flexDirection: 'row', gap: 10 },
  btn: {
    marginTop: 30,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
