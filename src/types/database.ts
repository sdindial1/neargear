export type UserRole = "parent" | "coach" | "both";
export type StrikeStatus = "active" | "warned" | "blackout_30" | "blackout_60" | "banned";
export type ListingCondition = "like_new" | "good" | "fair" | "poor";
export type ListingStatus = "active" | "sold" | "removed" | "pending";
export type MeetupStatus =
  | "deposit_pending"
  | "scheduled"
  | "buyer_confirmed"
  | "seller_confirmed"
  | "completed"
  | "cancelled_buyer"
  | "cancelled_seller"
  | "no_show_buyer"
  | "no_show_seller"
  | "disputed";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  city: string | null;
  avatar_url: string | null;
  avg_rating: number;
  review_count: number;
  strikes: number;
  strike_status: StrikeStatus;
  blackout_until: string | null;
  account_status: "active" | "flagged" | "banned" | null;
  zipcode: string | null;
  phone: string | null;
  created_at: string;
}

export interface Child {
  id: string;
  parent_id: string;
  name: string;
  age: number;
  primary_sport: string | null;
  created_at: string;
}

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  sport: string;
  category: string;
  condition: ListingCondition;
  price: number;
  description: string | null;
  photo_urls: string[];
  status: ListingStatus;
  ai_suggested_price: number | null;
  ai_condition_grade: string | null;
  ai_identified_item: string | null;
  ai_age_range: string | null;
  ai_size: string | null;
  ai_brand: string | null;
  ai_confidence: number | null;
  retail_price: number | null;
  views: number;
  city: string | null;
  age_min: number | null;
  age_max: number | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  meetup_id: string;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  retail_price: number | null;
  auto_completed: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  listing_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface SavedListing {
  user_id: string;
  listing_id: string;
  created_at: string;
}

export interface Meetup {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  deposit_amount: number;
  deposit_payment_intent_id: string | null;
  final_payment_intent_id: string | null;
  status: MeetupStatus;
  meetup_location: string | null;
  meetup_time: string | null;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  buyer_completed_at: string | null;
  seller_completed_at: string | null;
  completed_at: string | null;
  auto_completed: boolean | null;
  meetup_window_start: string | null;
  meetup_window_end: string | null;
  offered_price: number | null;
  offer_type: string | null;
  created_at: string;
}

export interface Strike {
  id: string;
  user_id: string;
  reason: string;
  meetup_id: string | null;
  created_at: string;
}
