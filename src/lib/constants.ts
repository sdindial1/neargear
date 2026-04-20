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
  "Swimming",
  "Track & Field",
  "Wrestling",
  "Other",
] as const;

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
