export interface AIListingAnalysis {
  item: string;
  brand: string;
  model: string;
  sport: string;
  category: string;
  condition: "like_new" | "good" | "fair" | "poor";
  conditionNotes: string;
  ageRange: string;
  ageMin: number;
  ageMax: number;
  size: string;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  description: string;
  confidence: number;
  photoQualityScore: number;
  photoQualityNotes: string;
}

export interface AIPriceResult {
  min: number;
  max: number;
  suggested: number;
  reasoning: string;
}
