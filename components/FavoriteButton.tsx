import { useEffect, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { canUseApp } from '../lib/guard';
import { supabase } from '../lib/supabase';

function showFavoriteAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

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

    const guard = await canUseApp();

    if (!guard.ok) {
      showFavoriteAlert('관심 등록 제한', guard.reason || '현재 관심 등록을 사용할 수 없습니다.');
      return;
    }

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
