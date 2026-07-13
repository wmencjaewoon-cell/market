import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import ListingForm from '../../components/ListingForm';
import { getMyStoreAccessContext } from '../../lib/storeStaff';

export default function StoreProductCreateScreen() {
  const [loading, setLoading] = useState(true);
  const [canManageStore, setCanManageStore] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      const access = await getMyStoreAccessContext();

      if (!mounted) return;
      setCanManageStore(access.canManageStore);
      setLoading(false);
    };

    void loadAccess();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '상품 등록' }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (!canManageStore) {
    return (
      <View style={styles.noticeScreen}>
        <Stack.Screen options={{ title: '상품 등록' }} />
        <Text style={styles.noticeTitle}>가게 권한이 필요합니다</Text>
        <Text style={styles.noticeText}>
          상품 등록은 가게 인증 완료 계정 또는 가게 매니저만 사용할 수 있습니다.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '상품 등록' }} />
      <ListingForm
        mode="create"
        createReturnTo="/store/product-create"
        createRedirectTo="/store/products"
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  noticeScreen: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 8 },
  noticeTitle: { color: '#111827', fontSize: 22, fontWeight: '900' },
  noticeText: { color: '#6b7280', fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
