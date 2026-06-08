import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getOrCreateRoom } from '../../lib/chat';
import { supabase } from '../../lib/supabase';

export default function OpenChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [targetAuthorId, setTargetAuthorId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from('listings')
        .select('author_id')
        .eq('id', Number(id))
        .single();

      if (error) {
        console.log('open-chat 게시글 조회 실패:', error);
        setLoading(false);
        return;
      }

      if (data?.author_id) {
        setTargetAuthorId(data.author_id);
      }

      setLoading(false);
    };

    run();
  }, [id]);

  useEffect(() => {
    const run = async () => {
      if (!user || !id || !targetAuthorId) return;

      const createdRoomId = await getOrCreateRoom(Number(id), targetAuthorId);
      setRoomId(String(createdRoomId));
    };

    run();
  }, [user, id, targetAuthorId]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href={`/login?redirect=/open-chat/${id}` as any} />;
  }

  if (roomId) {
    return <Redirect href={`/chat/${roomId}` as any} />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}