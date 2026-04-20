export interface SizeRange {
  label: string;
  size: string;
  notes?: string;
}

export interface SizeRecommendations {
  sport: string;
  age: number;
  equipment: Record<string, SizeRange>;
}

interface AgeRange {
  minAge: number;
  maxAge: number;
  size: string;
  notes?: string;
}

interface SportSizeChart {
  [category: string]: AgeRange[];
}

const baseballSizes: SportSizeChart = {
  Gloves: [
    { minAge: 4, maxAge: 6, size: '9"-10"', notes: "T-ball glove" },
    { minAge: 7, maxAge: 9, size: '10"-11"', notes: "Youth glove" },
    { minAge: 10, maxAge: 12, size: '11"-11.5"', notes: "Junior glove" },
    { minAge: 13, maxAge: 18, size: '11.5"-12.75"', notes: "Adult glove" },
  ],
  Bats: [
    { minAge: 4, maxAge: 6, size: '24"-26", 13-16oz', notes: "T-ball bat, -10 to -13 drop" },
    { minAge: 7, maxAge: 8, size: '26"-28", 16-18oz', notes: "Coach pitch, -10 drop" },
    { minAge: 9, maxAge: 10, size: '28"-30", 17-20oz', notes: "Youth, -10 drop" },
    { minAge: 11, maxAge: 12, size: '30"-32", 19-22oz', notes: "Youth/Senior, -8 to -10 drop" },
    { minAge: 13, maxAge: 14, size: '31"-33", 21-25oz', notes: "Senior league, -5 to -8 drop" },
    { minAge: 15, maxAge: 18, size: '32"-34", 26-31oz', notes: "BBCOR -3 required for HS" },
  ],
  Helmets: [
    { minAge: 4, maxAge: 7, size: "Youth (6-6.5)", notes: 'T-ball, 20"-21" circumference' },
    { minAge: 8, maxAge: 12, size: "Junior (6.5-7)", notes: '21"-22" circumference' },
    { minAge: 13, maxAge: 18, size: "Adult (7-7.5)", notes: '22"-23.5" circumference' },
  ],
  Cleats: [
    { minAge: 4, maxAge: 6, size: "Youth 10-13", notes: "Molded rubber cleats only" },
    { minAge: 7, maxAge: 9, size: "Youth 1-3", notes: "Molded cleats" },
    { minAge: 10, maxAge: 12, size: "Youth 3-6", notes: "Molded or metal (league dependent)" },
    { minAge: 13, maxAge: 18, size: "Men's 6-12", notes: "Metal cleats for HS+" },
  ],
};

const softballSizes: SportSizeChart = {
  Gloves: [
    { minAge: 4, maxAge: 6, size: '9"-10"', notes: "T-ball glove" },
    { minAge: 7, maxAge: 9, size: '10"-11.5"', notes: "Youth fastpitch" },
    { minAge: 10, maxAge: 12, size: '11.5"-12"', notes: "Fastpitch" },
    { minAge: 13, maxAge: 18, size: '12"-13"', notes: "Full-size fastpitch" },
  ],
  Bats: [
    { minAge: 6, maxAge: 8, size: '26"-28", -12 to -13 drop', notes: "Youth fastpitch" },
    { minAge: 9, maxAge: 10, size: '28"-30", -11 to -12 drop', notes: "Youth fastpitch" },
    { minAge: 11, maxAge: 12, size: '30"-32", -10 to -11 drop', notes: "Fastpitch" },
    { minAge: 13, maxAge: 18, size: '32"-34", -9 to -10 drop', notes: "Fastpitch" },
  ],
  Helmets: [
    { minAge: 4, maxAge: 7, size: "Youth (6-6.5)", notes: "T-ball" },
    { minAge: 8, maxAge: 12, size: "Junior (6.5-7)", notes: "With face guard" },
    { minAge: 13, maxAge: 18, size: "Adult (7-7.5)", notes: "With face guard" },
  ],
  Cleats: [
    { minAge: 4, maxAge: 6, size: "Youth 10-13", notes: "Molded rubber" },
    { minAge: 7, maxAge: 9, size: "Youth 1-3", notes: "Molded" },
    { minAge: 10, maxAge: 12, size: "Youth 3-6", notes: "Molded" },
    { minAge: 13, maxAge: 18, size: "Women's 5-10", notes: "Metal cleats for HS+" },
  ],
};

const soccerSizes: SportSizeChart = {
  Balls: [
    { minAge: 3, maxAge: 5, size: "Size 3", notes: "23-24 inches circumference" },
    { minAge: 6, maxAge: 8, size: "Size 3", notes: "23-24 inches circumference" },
    { minAge: 9, maxAge: 12, size: "Size 4", notes: "25-26 inches circumference" },
    { minAge: 13, maxAge: 18, size: "Size 5", notes: "27-28 inches, official match size" },
  ],
  "Shin Guards": [
    { minAge: 3, maxAge: 5, size: "XS (3'-3'6\")", notes: "Lightweight, slip-in" },
    { minAge: 6, maxAge: 8, size: "S (3'6\"-4')", notes: "Slip-in or ankle guard" },
    { minAge: 9, maxAge: 12, size: "M (4'-4'8\")", notes: "Slip-in" },
    { minAge: 13, maxAge: 15, size: "L (4'8\"-5'4\")", notes: "Competition level" },
    { minAge: 16, maxAge: 18, size: "XL (5'4\"+)", notes: "Full size" },
  ],
  Cleats: [
    { minAge: 3, maxAge: 5, size: "Youth 8-12", notes: "Firm ground (FG)" },
    { minAge: 6, maxAge: 8, size: "Youth 13-3", notes: "Firm ground (FG)" },
    { minAge: 9, maxAge: 12, size: "Youth 3-6", notes: "FG or multi-ground" },
    { minAge: 13, maxAge: 18, size: "Men's 6-12", notes: "FG, SG, AG, or TF" },
  ],
  "Goalkeeper Gloves": [
    { minAge: 6, maxAge: 8, size: "Size 3-4", notes: "Youth" },
    { minAge: 9, maxAge: 12, size: "Size 5-6", notes: "Junior" },
    { minAge: 13, maxAge: 18, size: "Size 7-10", notes: "Adult" },
  ],
};

const basketballSizes: SportSizeChart = {
  Balls: [
    { minAge: 4, maxAge: 8, size: "Size 5 (27.5\")", notes: "Youth mini" },
    { minAge: 9, maxAge: 12, size: "Size 6 (28.5\")", notes: "Intermediate/Women's" },
    { minAge: 13, maxAge: 18, size: "Size 7 (29.5\")", notes: "Official men's" },
  ],
  Shoes: [
    { minAge: 4, maxAge: 6, size: "Youth 10-13", notes: "Look for ankle support" },
    { minAge: 7, maxAge: 9, size: "Youth 1-4", notes: "Mid-top recommended" },
    { minAge: 10, maxAge: 12, size: "Youth 4-7", notes: "Transition to adult sizes" },
    { minAge: 13, maxAge: 18, size: "Men's 7-14", notes: "High-top for ankle support" },
  ],
};

const footballSizes: SportSizeChart = {
  Helmets: [
    { minAge: 5, maxAge: 7, size: 'Youth S (6-6.5, 19.5"-20.5")', notes: "Flag/Pee Wee" },
    { minAge: 8, maxAge: 10, size: 'Youth M (6.5-7, 20.5"-21.5")', notes: "Junior tackle" },
    { minAge: 11, maxAge: 13, size: 'Youth L (7-7.25, 21.5"-22.5")', notes: "Youth tackle" },
    { minAge: 14, maxAge: 18, size: 'Adult (7-7.75, 22"-24.5")', notes: "Varsity" },
  ],
  "Shoulder Pads": [
    { minAge: 5, maxAge: 7, size: "Micro (24-28 chest)", notes: "Flag/Pee Wee" },
    { minAge: 8, maxAge: 10, size: "Youth S (28-32 chest)", notes: "Junior tackle" },
    { minAge: 11, maxAge: 13, size: "Youth M/L (32-38 chest)", notes: "Youth tackle" },
    { minAge: 14, maxAge: 18, size: "Adult (38-52 chest)", notes: "Position-specific" },
  ],
  Balls: [
    { minAge: 5, maxAge: 8, size: "Pee Wee (size 5)", notes: "Ages 6-9, 10.5\" long" },
    { minAge: 9, maxAge: 11, size: "Junior (size 6)", notes: "Ages 9-12, 11\" long" },
    { minAge: 12, maxAge: 14, size: "Youth (size 7)", notes: "Ages 12-14, 11.5\" long" },
    { minAge: 15, maxAge: 18, size: "Official (size 9)", notes: "HS/College, 11.94\" long" },
  ],
  Cleats: [
    { minAge: 5, maxAge: 8, size: "Youth 10-3", notes: "Molded cleats" },
    { minAge: 9, maxAge: 12, size: "Youth 3-6", notes: "Molded" },
    { minAge: 13, maxAge: 18, size: "Men's 6-14", notes: "Molded or detachable" },
  ],
};

const lacrosseSizes: SportSizeChart = {
  Sticks: [
    { minAge: 5, maxAge: 8, size: '36"-40"', notes: "Youth mini stick" },
    { minAge: 9, maxAge: 12, size: '40"-42"', notes: "Youth full" },
    { minAge: 13, maxAge: 18, size: '40"-72"', notes: "Depends on position (attack short, defense long)" },
  ],
  Helmets: [
    { minAge: 5, maxAge: 8, size: "Youth XS/S", notes: "Certified NOCSAE" },
    { minAge: 9, maxAge: 12, size: "Youth S/M", notes: "Certified NOCSAE" },
    { minAge: 13, maxAge: 18, size: "Adult M/L/XL", notes: "Certified NOCSAE" },
  ],
  Gloves: [
    { minAge: 5, maxAge: 8, size: '8"-10"', notes: "Youth" },
    { minAge: 9, maxAge: 12, size: '10"-12"', notes: "Junior" },
    { minAge: 13, maxAge: 18, size: '12"-14"', notes: "Adult" },
  ],
  Pads: [
    { minAge: 5, maxAge: 8, size: "Youth S", notes: "Arm and shoulder" },
    { minAge: 9, maxAge: 12, size: "Youth M/L", notes: "Arm, shoulder, rib" },
    { minAge: 13, maxAge: 18, size: "Adult S-XL", notes: "Full protective set" },
  ],
};

const hockeySizes: SportSizeChart = {
  Skates: [
    { minAge: 4, maxAge: 6, size: "Youth 8-13 (1-2 sizes below shoe)", notes: "Adjustable recommended" },
    { minAge: 7, maxAge: 9, size: "Youth 1-3 (1-2 sizes below shoe)", notes: "Snug fit" },
    { minAge: 10, maxAge: 12, size: "Junior 3-5.5", notes: "1-1.5 sizes below shoe" },
    { minAge: 13, maxAge: 18, size: "Senior 5-13", notes: "1-1.5 sizes below shoe" },
  ],
  Sticks: [
    { minAge: 4, maxAge: 6, size: "Youth (38-44\")", notes: "Should reach chin when standing" },
    { minAge: 7, maxAge: 9, size: "Youth (44-50\")", notes: "Chin to nose height" },
    { minAge: 10, maxAge: 12, size: "Junior (50-54\")", notes: "30-50 flex" },
    { minAge: 13, maxAge: 15, size: "Intermediate (54-57\")", notes: "55-70 flex" },
    { minAge: 16, maxAge: 18, size: "Senior (57-63\")", notes: "75-110 flex" },
  ],
  Helmets: [
    { minAge: 4, maxAge: 7, size: "Youth (6-6.5)", notes: "With cage required" },
    { minAge: 8, maxAge: 12, size: "Junior (6.5-7)", notes: "With cage required" },
    { minAge: 13, maxAge: 18, size: "Senior (7-7.75)", notes: "Cage or visor" },
  ],
  Pads: [
    { minAge: 4, maxAge: 7, size: "Youth S/M", notes: "Shin, shoulder, elbow, pants" },
    { minAge: 8, maxAge: 12, size: "Junior M/L", notes: "Full set" },
    { minAge: 13, maxAge: 18, size: "Senior S-XL", notes: "Position-specific sizing" },
  ],
};

const sportCharts: Record<string, SportSizeChart> = {
  Baseball: baseballSizes,
  Softball: softballSizes,
  Soccer: soccerSizes,
  Basketball: basketballSizes,
  Football: footballSizes,
  Lacrosse: lacrosseSizes,
  Hockey: hockeySizes,
};

export function getSizeRecommendations(age: number, sport: string): SizeRecommendations {
  const chart = sportCharts[sport];
  const equipment: Record<string, SizeRange> = {};

  if (!chart) {
    return { sport, age, equipment };
  }

  for (const [category, ranges] of Object.entries(chart)) {
    const match = ranges.find((r) => age >= r.minAge && age <= r.maxAge);
    if (match) {
      equipment[category] = {
        label: category,
        size: match.size,
        notes: match.notes,
      };
    }
  }

  return { sport, age, equipment };
}

export function getAgeRangeForSize(sport: string, category: string, size: string): { min: number; max: number } | null {
  const chart = sportCharts[sport];
  if (!chart || !chart[category]) return null;

  const match = chart[category].find((r) => r.size === size);
  if (!match) return null;

  return { min: match.minAge, max: match.maxAge };
}
