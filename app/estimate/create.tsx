import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
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
import { useAuth } from '../../contexts/AuthContext';
import { fetchMyRegionSettings, fetchMyRegions } from '../../lib/region';
import { supabase } from '../../lib/supabase';

const ESTIMATE_CATEGORIES = [
  '전체 인테리어',
  '도배',
  '장판',
  '욕실',
  '주방',
  '타일',
  '필름',
  '전기/조명',
  '철거',
  '목공',
  '가구제작',
  '상가공사',
  '부분수리',
  '유지보수',
];

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function isValidDateText(value: string) {
  if (!value.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;

  const date = new Date(`${value.trim()}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

export default function EstimateCreateScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState(ESTIMATE_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredContact, setPreferredContact] = useState('앱 채팅');
  const [description, setDescription] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadDefaultRegion = async () => {
      const [regions, settings] = await Promise.all([
        fetchMyRegions(),
        fetchMyRegionSettings(),
      ]);
      const activeRegion =
        regions.find((item: any) => item.id === settings?.active_region_id) || regions[0];

      if (activeRegion?.region_name) {
        setRegion(activeRegion.region_name);
      }
    };

    void loadDefaultRegion();
  }, []);

  const pickImages = async () => {
    const remain = 6 - imageUris.length;
    if (remain <= 0) {
      showAlert('사진 첨부', '사진은 최대 6장까지 첨부할 수 있습니다.');
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
      ].slice(0, 6));
    }
  };

  const uploadEstimateImage = async (requestId: number, uri: string, sortOrder: number) => {
    if (!user) return;

    const filePath = `${user.id}/${requestId}/${Date.now()}-${sortOrder}.jpg`;
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
      .from('estimate-images')
      .upload(filePath, uploadData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase.from('estimate_request_images').insert({
      estimate_request_id: requestId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (rowError) throw rowError;
  };

  const submitEstimate = async () => {
    if (submitting) return;

    if (!user) {
      router.push('/login?redirect=/estimate/create' as any);
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setMessage('문의 제목을 입력해 주세요.');
      return;
    }

    if (!trimmedDescription) {
      setMessage('상세 내용을 입력해 주세요.');
      return;
    }

    if (!isValidDateText(desiredDate)) {
      setMessage('희망 일정은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');

      const { data, error } = await supabase
        .from('estimate_requests')
        .insert({
          user_id: user.id,
          category,
          region: region.trim() || null,
          address: address.trim() || null,
          budget: budget.trim() || null,
          desired_date: desiredDate.trim() || null,
          preferred_contact: preferredContact.trim() || null,
          title: trimmedTitle,
          description: trimmedDescription,
          status: 'open',
        })
        .select('id')
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      const requestId = Number(data?.id);
      if (!requestId) {
        setMessage('견적문의 등록 결과를 받지 못했습니다.');
        return;
      }

      for (let i = 0; i < imageUris.length; i += 1) {
        await uploadEstimateImage(requestId, imageUris[i], i);
      }

      showAlert('견적문의 등록 완료', '등록된 문의는 인증 가게가 확인할 수 있습니다.');
      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      console.log('견적문의 등록 실패:', error);
      setMessage(error?.message || '견적문의 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '견적문의' }} />

      <Text style={styles.title}>어떤 공사가 필요하세요?</Text>

      <View style={styles.categoryGrid}>
        {ESTIMATE_CATEGORIES.map((item) => {
          const active = category === item;

          return (
            <TouchableOpacity
              key={item}
              style={[styles.categoryBtn, active && styles.categoryBtnActive]}
              onPress={() => setCategory(item)}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.formSection}>
        <Text style={styles.label}>제목</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="예: 24평 아파트 욕실 리모델링 견적 문의"
        />

        <Text style={styles.label}>지역</Text>
        <TextInput
          style={styles.input}
          value={region}
          onChangeText={setRegion}
          placeholder="예: 서울 강동구 천호동"
        />

        <Text style={styles.label}>주소</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="상담에 필요한 범위까지만 입력해 주세요."
        />

        <Text style={styles.label}>희망 일정</Text>
        <TextInput
          style={styles.input}
          value={desiredDate}
          onChangeText={setDesiredDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.label}>예산</Text>
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          placeholder="예: 500만원 내외, 상담 후 결정"
        />

        <Text style={styles.label}>연락 방법</Text>
        <TextInput
          style={styles.input}
          value={preferredContact}
          onChangeText={setPreferredContact}
          placeholder="예: 앱 채팅, 전화, 문자"
        />

        <Text style={styles.label}>상세 내용</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="공간 상태, 원하는 공사 범위, 필요한 자재, 참고사항을 적어주세요."
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.imageSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>사진/도면 첨부</Text>
          <TouchableOpacity style={styles.imageAddBtn} onPress={pickImages}>
            <Ionicons name="image-outline" size={17} color="#2563eb" />
            <Text style={styles.imageAddText}>추가</Text>
          </TouchableOpacity>
        </View>

        {imageUris.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
            {imageUris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.previewBox}>
                <Image source={{ uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setImageUris((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.imageHelp}>현장 사진이나 도면을 첨부하면 상담이 빨라집니다.</Text>
        )}
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submitEstimate}
        disabled={submitting}
      >
        <Text style={styles.submitText}>{submitting ? '등록 중...' : '등록하기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  categoryText: { color: '#374151', fontSize: 13, fontWeight: '800' },
  categoryTextActive: { color: '#fff' },
  formSection: { gap: 10 },
  label: { color: '#111827', fontSize: 14, fontWeight: '900' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 15,
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 140, lineHeight: 21 },
  imageSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#111827', fontSize: 16, fontWeight: '900' },
  imageAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  imageAddText: { color: '#2563eb', fontSize: 13, fontWeight: '900' },
  imageRow: { gap: 10 },
  previewBox: {
    width: 92,
    height: 92,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  previewImage: { width: '100%', height: '100%' },
  removeImageBtn: {
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
  imageHelp: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorText: { color: '#dc2626', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  submitBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
