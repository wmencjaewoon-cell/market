// 공용 도메인 타입: 홈/관심/가게 노출 등 여러 화면이 공유하는 최소 타입을 둔다.
export type UserType = 'store' | 'personal';

export type CategoryLabel = '가게' | '거래' | '나눔' | '구함';

export type Listing = {
  id: number;
  category: 'store' | 'trade' | 'share' | 'want';
  title: string;
  description: string | null;
  price_text: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  urgent: boolean;
  available_now: boolean;
  available_today: boolean;
  quantity_total: number;
  quantity_remaining: number;
  quantity_sold: number;
  status: 'active' | 'reserved' | 'done' | 'hidden';
  author_id: string;
  created_at: string;
  last_bumped_at?: string | null;
  favorites_count?: number | null;
  chats_count?: number | null;
  profiles?: {
    id?: string | null;
    display_name: string;
    user_type: UserType;
    business_verified?: boolean | null;
    phone: string | null;
    is_phone_public: boolean;
    trust_points?: number | null;
    trust_level?: number | null;
    seller_level_style?: string | null;
    show_level_on_posts?: boolean | null;
    store_subscription_plan?: string | null;
    store_subscription_status?: string | null;
    is_premium?: boolean | null;
    has_local_ad?: boolean | null;
    map_highlight?: boolean | null;
    recommended_exposure?: boolean | null;
  } | null;
};
