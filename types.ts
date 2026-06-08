export type UserRegion = {
  id: number;
  user_id: string;
  region_name: string;
  latitude: number | null;
  longitude: number | null;
  verified: boolean;
  created_at: string;
};

export type UserRegionSettings = {
  user_id: string;
  active_region_id: number | null;
  radius_km: number;
  updated_at: string;
};

export type Listing = {
  id: number;
  author_id: string;
  category: 'trade' | 'share' | 'want';
  title: string;
  price_text: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  urgent?: boolean;
  available_now?: boolean;
  available_today?: boolean;
  quantity_total?: number;
  quantity_remaining?: number;
  quantity_sold?: number;
  status: string;
  created_at: string;
  profiles?: any;
  listing_images?: any[];
  favorites_count?: number;
  chats_count?: number;
};


export type RegionSearchItem = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  region_name: string;
  x: string;
  y: string;
};
