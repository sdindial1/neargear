export const DFW_CITIES = [
  "Frisco",
  "Plano",
  "Allen",
  "McKinney",
  "Southlake",
  "Keller",
  "Arlington",
  "Irving",
  "Garland",
  "Mesquite",
  "Richardson",
  "Carrollton",
  "Lewisville",
  "Flower Mound",
  "Coppell",
  "Cedar Hill",
  "DeSoto",
  "Duncanville",
  "Grand Prairie",
  "Other",
] as const;

/**
 * The canonical sport values. /marketplace filters with an exact equality
 * against these, so anything stored in a different casing — or not in this list
 * at all — is unreachable by every filter pill no matter how many listings
 * carry it. That is not hypothetical: 25 seed listings were written lowercase
 * and "golf" was missing entirely, so nine of these pills rendered an empty
 * grid while the inventory to fill five of them sat in the database.
 * See migration 029 and canonicalSport() below.
 */
export const SPORTS = [
  "Baseball",
  "Softball",
  "Soccer",
  "Basketball",
  "Football",
  "Lacrosse",
  "Hockey",
  "Volleyball",
  "Tennis",
  "Golf",
  "Swimming",
  "Track & Field",
  "Wrestling",
  "Other",
] as const;

/**
 * Map any casing to the canonical value; null if it is not a known sport.
 *
 * Applied server-side on write (POST /api/listings) so the database cannot
 * drift out of canonical form again. Normalising on READ instead would fix one
 * query and leave every future query to remember — and would defeat the index.
 */
export function canonicalSport(input: string | null | undefined): string | null {
  if (!input) return null;
  const needle = input.trim().toLowerCase();
  return SPORTS.find((s) => s.toLowerCase() === needle) ?? null;
}

export const SPORT_CATEGORIES: Record<string, string[]> = {
  Baseball: ["Bats", "Gloves", "Helmets", "Cleats", "Bags", "Protective Gear", "Training Equipment", "Other"],
  Softball: ["Bats", "Gloves", "Helmets", "Cleats", "Bags", "Protective Gear", "Training Equipment", "Other"],
  Soccer: ["Cleats", "Shin Guards", "Balls", "Goals", "Bags", "Goalkeeper Gloves", "Training Equipment", "Other"],
  Basketball: ["Shoes", "Balls", "Hoops", "Training Equipment", "Bags", "Other"],
  Football: ["Helmets", "Shoulder Pads", "Cleats", "Gloves", "Balls", "Protective Gear", "Training Equipment", "Other"],
  Lacrosse: ["Sticks", "Helmets", "Gloves", "Pads", "Goals", "Bags", "Other"],
  Hockey: ["Sticks", "Skates", "Helmets", "Pads", "Gloves", "Bags", "Goals", "Other"],
  Volleyball: ["Balls", "Shoes", "Knee Pads", "Nets", "Bags", "Other"],
  Tennis: ["Rackets", "Shoes", "Balls", "Bags", "Training Equipment", "Other"],
  Golf: ["Clubs", "Club Sets", "Drivers", "Putters", "Balls", "Bags", "Shoes", "Training Equipment", "Other"],
  Swimming: ["Goggles", "Suits", "Caps", "Training Equipment", "Bags", "Other"],
  "Track & Field": ["Shoes", "Spikes", "Throwing Equipment", "Jumping Equipment", "Training Equipment", "Other"],
  Wrestling: ["Shoes", "Headgear", "Singlets", "Knee Pads", "Training Equipment", "Other"],
  Other: ["Equipment", "Apparel", "Accessories", "Other"],
};

export const CONDITIONS = [
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
] as const;

export const ROLES = [
  { value: "parent", label: "Parent" },
  { value: "coach", label: "Coach" },
  { value: "both", label: "Both" },
] as const;
