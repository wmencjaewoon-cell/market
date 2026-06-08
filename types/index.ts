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
  profiles?: {
    display_name: string;
    user_type: UserType;
    phone: string | null;
    is_phone_public: boolean;
  } | null;
};
