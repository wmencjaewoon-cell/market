import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { canUseApp } from '../../lib/guard';
import { supabase } from '../../lib/supabase';

export default function KeywordScreen() {
  const { user } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchKeywords();
  }, [user]);

  const fetchKeywords = async () => {
    const { data, error } = await supabase
      .from('keyword_alerts')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setItems(data || []);
    }
  };

  const handleAdd = async () => {
    if (!keyword.trim()) return;

    const guard = await canUseApp();

    if (!guard.ok) {
      Alert.alert('키워드 추가 제한', guard.reason || '현재 키워드를 추가할 수 없습니다.');
      return;
    }

    const { error } = await supabase.from('keyword_alerts').insert({
      user_id: user?.id,
      keyword: keyword.trim(),
    });

    if (error) {
      Alert.alert('추가 실패', error.message);
      return;
    }

    setKeyword('');
    fetchKeywords();
  };

  const handleDelete = async (id: number) => {
    await supabase.from('keyword_alerts').delete().eq('id', id);
    fetchKeywords();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBox}>
        <TextInput
          style={styles.input}
          placeholder="예: 타일, 석고보드, 페인트"
          value={keyword}
          onChangeText={setKeyword}
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>추가</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>등록한 키워드가 없습니다.</Text>}
        renderItem={({ item }) => (
          <View style={styles.keywordItem}>
            <Text style={styles.keywordText}>{item.keyword}</Text>
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Text style={styles.deleteText}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 16 },
  topBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
  },
  addBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  list: { gap: 10 },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280' },
  keywordItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keywordText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '700',
  },
});
