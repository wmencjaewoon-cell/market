import { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function FavoriteButton({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkFavorite();
  }, [user]);

  const checkFavorite = async () => {
    const { data } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', user?.id)
      .eq('listing_id', listingId)
      .single();

    setLiked(!!data);
  };

  const toggleFavorite = async () => {
    if (!user) return;

    if (liked) {
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId);

      setLiked(false);
    } else {
      await supabase.from('favorites').insert({
        user_id: user.id,
        listing_id: listingId,
      });

      setLiked(true);
    }
  };

  return (
    <TouchableOpacity onPress={toggleFavorite}>
      <Text style={{ fontSize: 18 }}>
        {liked ? '❤️' : '🤍'}
      </Text>
    </TouchableOpacity>
  );
}