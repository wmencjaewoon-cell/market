import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import MaterialCard from '../../components/MaterialCard';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function FavoritesScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchFavorites();
  }, [user]);

  const fetchFavorites = async () => {
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        listing_id,
        listings (
          *,
          profiles!listings_author_id_fkey (
            id,
            display_name,
            user_type,
            business_verified,
            phone,
            is_phone_public
          ),
          listing_images (
            id,
            image_path,
            sort_order
          )
        )
      `)
      .eq('user_id', user?.id);

    if (error) {
      console.log('관심목록 조회 실패:', error);
      return;
    }

    const favoriteListings =
      data
        ?.map((row: any) => row.listings)
        .filter(Boolean)
        .map((listing: any) => ({
          ...listing,
          favorites_count: listing.favorites_count ?? 0,
          chats_count: listing.chats_count ?? 0,
          listing_images: [...(listing.listing_images || [])].sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          ),
        })) || [];

    setItems(favoriteListings);
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>관심목록이 없습니다.</Text>}
      renderItem={({ item }) => (
        <MaterialCard item={item} onRefresh={fetchFavorites} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#6b7280',
  },
});
