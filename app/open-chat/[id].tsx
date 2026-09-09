// 딥링크 채팅 진입 화면: 게시글 id로 기존 채팅방을 찾거나 새 방을 만든 뒤 채팅방으로 이동한다.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getOrCreateRoom } from '../../lib/chat';
import { fetchMyRegions } from '../../lib/region';
import { supabase } from '../../lib/supabase';

export default function OpenChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [targetAuthorId, setTargetAuthorId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regionChecked, setRegionChecked] = useState(false);
  const [needsRegionVerify, setNeedsRegionVerify] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from('listings')
        .select('author_id')
        .eq('id', Number(id))
        .single();

      if (error) {        setLoading(false);
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
      if (!user) {
        setRegionChecked(true);
        return;
      }

      try {
        setRegionChecked(false);

        const myRegions = await fetchMyRegions();

        setNeedsRegionVerify(!myRegions || myRegions.length === 0);
        setRegionChecked(true);
      } catch {        setNeedsRegionVerify(true);
        setRegionChecked(true);
      }
    };

    run();
  }, [user]);

  useEffect(() => {
    const run = async () => {
      if (!user || !id || !targetAuthorId) return;
      if (!regionChecked) return;
      if (needsRegionVerify) return;

      const createdRoomId = await getOrCreateRoom(Number(id), targetAuthorId);
      setRoomId(String(createdRoomId));
    };

    run();
  }, [user, id, targetAuthorId, regionChecked, needsRegionVerify]);

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

  if (!regionChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (needsRegionVerify) {
    return <Redirect href={`/(tabs)/home/regions?returnTo=/open-chat/${id}` as any} />;
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
