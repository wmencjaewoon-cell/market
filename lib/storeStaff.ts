import { supabase } from './supabase';

export type StoreAccessContext = {
  currentUserId: string | null;
  currentProfile: any | null;
  storeUserId: string | null;
  storeProfile: any | null;
  membership: any | null;
  isStoreOwner: boolean;
  isManager: boolean;
  isStaff: boolean;
  canManageStore: boolean;
};

export async function getMyStoreAccessContext(): Promise<StoreAccessContext> {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id || null;

  if (!currentUserId) {
    return {
      currentUserId: null,
      currentProfile: null,
      storeUserId: null,
      storeProfile: null,
      membership: null,
      isStoreOwner: false,
      isManager: false,
      isStaff: false,
      canManageStore: false,
    };
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUserId)
    .maybeSingle();

  const isStoreOwner =
    currentProfile?.user_type === 'store' &&
    !!currentProfile?.business_verified &&
    currentProfile?.status !== 'blocked';

  if (isStoreOwner) {
    return {
      currentUserId,
      currentProfile: currentProfile || null,
      storeUserId: currentUserId,
      storeProfile: currentProfile || null,
      membership: null,
      isStoreOwner: true,
      isManager: true,
      isStaff: false,
      canManageStore: true,
    };
  }

  const { data: membership } = await supabase
    .from('store_staff_members')
    .select('*')
    .eq('staff_user_id', currentUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership?.store_user_id) {
    return {
      currentUserId,
      currentProfile: currentProfile || null,
      storeUserId: null,
      storeProfile: null,
      membership: null,
      isStoreOwner: false,
      isManager: false,
      isStaff: false,
      canManageStore: false,
    };
  }

  const { data: storeProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', membership.store_user_id)
    .maybeSingle();

  const isVerifiedStore =
    storeProfile?.user_type === 'store' &&
    !!storeProfile?.business_verified &&
    storeProfile?.status !== 'blocked';
  const isManager = membership.role === 'manager';

  return {
    currentUserId,
    currentProfile: currentProfile || null,
    storeUserId: isVerifiedStore ? membership.store_user_id : null,
    storeProfile: isVerifiedStore ? storeProfile || null : null,
    membership,
    isStoreOwner: false,
    isManager,
    isStaff: true,
    canManageStore: isVerifiedStore && isManager,
  };
}
