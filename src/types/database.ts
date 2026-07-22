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
  strike_count: number | null;
  suspension_ends_at: string | null;
  suspended_permanently: boolean | null;
  is_founding_member: boolean | null;
  family_name: string | null;
  spouse_name: string | null;
  spouse_phone: string | null;
  spouse_email: string | null;
  active_profile: "primary" | "spouse" | null;
  partner_program_id: string | null;
  partner_verified: boolean | null;
  partner_verified_at: string | null;
  referral_source: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_payouts_enabled: boolean | null;
  created_at: string;
}

export type PartnerStatus = "active" | "paused" | "ended";
export type PartnerPayoutStatus = "pending" | "paid" | "reversed";
export type PartnerPayoutMethod = "check" | "ach" | "wire" | "other";

export interface PartnerProgram {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  is_nonprofit: boolean | null;
  ein: string | null;
  rev_share_percent: number;
  badge_text: string | null;
  badge_color: string | null;
  landing_page_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: PartnerStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

// One row per program from the partner_program_stats view. Money fields are cents.
export interface PartnerProgramStats {
  id: string;
  slug: string;
  name: string;
  rev_share_percent: number;
  status: PartnerStatus;
  verified_members: number;
  total_transactions: number;
  lifetime_gross_sales: number;
  lifetime_attributed: number;
  pending_payout: number;
  total_paid_out: number;
}

export interface PartnerTransaction {
  id: string;
  transaction_id: string;
  partner_program_id: string;
  seller_id: string;
  gross_sale_amount: number;   // cents
  platform_fee_amount: number; // cents
  attributed_amount: number;   // cents
  payout_status: PartnerPayoutStatus;
  partner_payout_id: string | null;
  created_at: string;
}

export interface PartnerPayout {
  id: string;
  partner_program_id: string;
  period_start: string;
  period_end: string;
  total_gross_sales: number;
  total_platform_fees: number;
  total_attributed: number;
  payout_amount: number;
  payout_method: PartnerPayoutMethod | null;
  payout_reference: string | null;
  paid_at: string | null;
  paid_by_admin_id: string | null;
  notes: string | null;
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
