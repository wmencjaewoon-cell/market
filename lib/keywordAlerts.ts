import { supabase } from './supabase';

export async function fetchKeywordAlerts() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('keyword_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addKeywordAlert(keyword: string) {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const normalized = keyword.trim();

  if (!normalized) {
    throw new Error('키워드를 입력해 주세요.');
  }

  const { error } = await supabase.from('keyword_alerts').upsert(
    {
      user_id: user.id,
      keyword: normalized,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,keyword',
    }
  );

  if (error) throw error;
}

export async function deleteKeywordAlert(id: number) {
  const { error } = await supabase
    .from('keyword_alerts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function toggleKeywordAlert(id: number, isActive: boolean) {
  const { error } = await supabase
    .from('keyword_alerts')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}