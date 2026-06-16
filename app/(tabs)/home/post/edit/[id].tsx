import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../../../../../contexts/AuthContext';
import { canUseApp } from '../../../../../lib/guard';
import { sendFavoriteListingUpdate } from '../../../../../lib/listingNotifications';
import { supabase } from '../../../../../lib/supabase';

export default function EditPostScreen() {
  const { id, lat, lng } = useLocalSearchParams<{
    id: string;
    lat?: string;
    lng?: string;
  }>();

  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [post, setPost] = useState<any | null>(null);
  const [existingImages, setExistingImages] = useState<any[]>([]);
  const [newImageUris, setNewImageUris] = useState<string[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);

  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [quantityTotalText, setQuantityTotalText] = useState('1');
  const [quantityRemainingText, setQuantityRemainingText] = useState('1');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'reserved' | 'done'>('active');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchPost();
  }, [id]);

  useEffect(() => {
    if (lat && lng) {
      setLatitude(Number(lat));
      setLongitude(Number(lng));
    }
  }, [lat, lng]);

  const fetchPost = async () => {
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
      .eq('id', Number(id))
      .single();

    if (error || !data) {
      Alert.alert('오류', '게시글을 불러오지 못했습니다.');
      router.back();
      return;
    }

    if (user?.id && data.author_id !== user.id) {
      Alert.alert('권한 없음', '본인 게시글만 수정할 수 있습니다.');
      router.back();
      return;
    }

    const sortedImages = [...(data.listing_images || [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    setPost(data);
    setExistingImages(sortedImages);
    setTitle(data.title || '');
    setPriceText(data.price_text || '');
    setQuantityTotalText(String(data.quantity_total ?? 1));
    setQuantityRemainingText(
      String(data.quantity_remaining ?? (data.status === 'done' ? 0 : data.quantity_total ?? 1))
    );
    setDescription(data.description || '');
    setStatus(data.status || 'active');
    setLatitude(data.latitude ?? null);
    setLongitude(data.longitude ?? null);
    setLoading(false);
  };

  const existingImageUrls = useMemo(() => {
    return existingImages
      .filter((img) => !deletedImageIds.includes(img.id))
      .map((img) => {
        const { data } = supabase.storage
          .from('listing-images')
          .getPublicUrl(img.image_path);

        return {
          ...img,
          url: data.publicUrl,
        };
      });
  }, [existingImages, deletedImageIds]);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
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

      setNewImageUris((prev) => {
        const totalCount = existingImageUrls.length + prev.length;
        const remain = Math.max(0, 10 - totalCount);
        return [...prev, ...uris.slice(0, remain)];
      });
    }
  };

  const removeExistingImage = (imageId: number) => {
    setDeletedImageIds((prev) => [...prev, imageId]);
  };

  const removeNewImage = (index: number) => {
    setNewImageUris((prev) => prev.filter((_, i) => i !== index));
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

    const { error: rowError } = await supabase.from('listing_images').insert({
      listing_id: listingId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (rowError) throw rowError;
  };

  const handlePickLocation = () => {
    router.push({
      pathname: '/map-picker',
      params: {
        lat: latitude != null ? String(latitude) : undefined,
        lng: longitude != null ? String(longitude) : undefined,
        returnTo: `/(tabs)/home/post/edit/${id}`,
      },
    } as any);
  };

  const handleSave = async () => {
    if (!post) return;

    if (!title.trim()) {
      Alert.alert('확인', '제목을 입력해 주세요.');
      return;
    }

    try {
      setSaving(true);

      const guard = await canUseApp();

      if (!guard.ok) {
        Alert.alert('게시글 수정 제한', guard.reason || '현재 게시글을 수정할 수 없습니다.');
        return;
      }

      const quantityTotal = Number(quantityTotalText);
      const rawQuantityRemaining = Number(quantityRemainingText);

      if (!Number.isInteger(quantityTotal) || quantityTotal < 1) {
        Alert.alert('확인', '판매 전체 수량은 1개 이상 입력해 주세요.');
        return;
      }

      if (!Number.isInteger(rawQuantityRemaining) || rawQuantityRemaining < 0) {
        Alert.alert('확인', '남은 수량은 0개 이상 입력해 주세요.');
        return;
      }

      const quantityRemaining = status === 'done' ? 0 : rawQuantityRemaining;

      if (quantityRemaining > quantityTotal) {
        Alert.alert('확인', '남은 수량은 전체 수량보다 클 수 없습니다.');
        return;
      }

      if (status !== 'done' && quantityRemaining < 1) {
        Alert.alert('확인', '남은 수량이 0개이면 상태를 거래완료로 바꿔 주세요.');
        return;
      }

      const quantitySold = quantityTotal - quantityRemaining;
      const priceChanged = post.price_text !== priceText.trim();

        const contentChanged =
            post.title !== title.trim() ||
            (post.description || '') !== description.trim() ||
            post.status !== status ||
            Number(post.quantity_total ?? 1) !== quantityTotal ||
            Number(post.quantity_remaining ?? 1) !== quantityRemaining ||
            post.latitude !== latitude ||
            post.longitude !== longitude;

      const { error: updateError } = await supabase
        .from('listings')
        .update({
          title: title.trim(),
          price_text: priceText.trim(),
          description: description.trim(),
          status,
          quantity_total: quantityTotal,
          quantity_remaining: quantityRemaining,
          quantity_sold: quantitySold,
          latitude,
          longitude,
        })
        .eq('id', post.id)
        .eq('author_id', user?.id);

      if (updateError) throw updateError;

      if (priceChanged || contentChanged) {
        await sendFavoriteListingUpdate({
            listingId: post.id,
            authorId: post.author_id,
            title: title.trim(),
            changeType: priceChanged ? 'price' : 'content',
            oldPrice: post.price_text,
            newPrice: priceText.trim(),
        });
        }

      const deletedImages = existingImages.filter((img) =>
        deletedImageIds.includes(img.id)
      );

      if (deletedImages.length > 0) {
        const deletePaths = deletedImages
          .map((img) => img.image_path)
          .filter(Boolean);

        if (deletePaths.length > 0) {
          await supabase.storage.from('listing-images').remove(deletePaths);
        }

        const { error: deleteRowError } = await supabase
          .from('listing_images')
          .delete()
          .in('id', deletedImageIds);

        if (deleteRowError) throw deleteRowError;
      }

      const remainedCount = existingImages.filter(
        (img) => !deletedImageIds.includes(img.id)
      ).length;

      for (let i = 0; i < newImageUris.length; i += 1) {
        await uploadImageToStorage(post.id, newImageUris[i], remainedCount + i);
      }

      Alert.alert('수정 완료', '게시글이 수정되었습니다.');
      router.replace(`/(tabs)/home/post/${post.id}` as any);
    } catch (e: any) {
      Alert.alert('수정 실패', e?.message || '게시글을 수정하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {/* <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>게시글 수정</Text> */}

        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.label}>사진</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.imageRow}>
          {existingImageUrls.map((img) => (
            <View key={img.id} style={styles.imageBox}>
              <Image source={{ uri: img.url }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeExistingImage(img.id)}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {newImageUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.imageBox}>
              <Image source={{ uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeNewImage(index)}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {existingImageUrls.length + newImageUris.length < 10 ? (
            <TouchableOpacity style={styles.addImageBox} onPress={pickImages}>
              <Ionicons name="camera-outline" size={26} color="#6b7280" />
              <Text style={styles.addImageText}>
                {existingImageUrls.length + newImageUris.length}/10
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <Text style={styles.label}>제목</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="제목"
      />

      <Text style={styles.label}>가격</Text>
      <TextInput
        style={styles.input}
        value={priceText}
        onChangeText={setPriceText}
        placeholder="가격 또는 가격 문의"
      />

      <Text style={styles.label}>판매 전체 수량</Text>
      <TextInput
        style={styles.input}
        value={quantityTotalText}
        onChangeText={(value) => {
          const onlyNumber = value.replace(/[^0-9]/g, '');
          setQuantityTotalText(onlyNumber);
        }}
        keyboardType="number-pad"
        placeholder="1"
      />

      <Text style={styles.label}>남은 수량</Text>
      <TextInput
        style={styles.input}
        value={quantityRemainingText}
        onChangeText={(value) => {
          const onlyNumber = value.replace(/[^0-9]/g, '');
          setQuantityRemainingText(onlyNumber);
        }}
        keyboardType="number-pad"
        placeholder="1"
      />

      <Text style={styles.label}>내용</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="내용"
        multiline
      />

      <Text style={styles.label}>상태</Text>
      <View style={styles.statusRow}>
        {[
          { key: 'active', label: '거래중' },
          { key: 'reserved', label: '예약중' },
          { key: 'done', label: '거래완료' },
        ].map((option) => {
          const active = status === option.key;

          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.statusBtn, active && styles.statusBtnActive]}
              onPress={() => setStatus(option.key as any)}
            >
              <Text style={[styles.statusText, active && styles.statusTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>거래 희망 장소</Text>
      <View style={styles.locationBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.locationTitle}>
            {latitude != null && longitude != null
              ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              : '거래 장소가 없습니다.'}
          </Text>
          <Text style={styles.locationSub}>지도에서 거래 위치를 다시 선택할 수 있어요.</Text>
        </View>

        <TouchableOpacity style={styles.locationBtn} onPress={handlePickLocation}>
          <Text style={styles.locationBtnText}>변경</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? '저장 중...' : '수정 완료'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 60 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
  },

  textarea: {
    height: 140,
    textAlignVertical: 'top',
  },

  imageRow: {
    flexDirection: 'row',
    gap: 10,
  },

  imageBox: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  removeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  removeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },

  addImageBox: {
    width: 92,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },

  addImageText: {
    marginTop: 4,
    color: '#6b7280',
    fontWeight: '700',
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
    fontWeight: '800',
    color: '#374151',
  },

  statusTextActive: {
    color: '#fff',
  },

  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f9fafb',
  },

  locationTitle: {
    fontWeight: '800',
    color: '#111827',
  },

  locationSub: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 13,
  },

  locationBtn: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  locationBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  saveBtn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },

  saveText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
