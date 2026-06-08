import { supabase } from './supabase';

export async function fetchMyNotifications() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function markNotificationAsRead(id: number) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getUnreadNotificationCount() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) throw error;
  return count || 0;
}