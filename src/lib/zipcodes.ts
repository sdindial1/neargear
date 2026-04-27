export interface ZipEntry {
  zipcode: string;
  city: string;
  lat: number;
  lng: number;
}

// Approximate ZCTA centroids for the DFW metro. Coverage is intentionally
// broad — 75xxx + 76xxx — so HEB, Grapevine, Mansfield, etc. are reachable
// without falling back to city centroids.
export const DFW_ZIPCODES: ZipEntry[] = [
  // Frisco
  { zipcode: "75033", city: "Frisco", lat: 33.18, lng: -96.815 },
  { zipcode: "75034", city: "Frisco", lat: 33.135, lng: -96.835 },
  { zipcode: "75035", city: "Frisco", lat: 33.15, lng: -96.77 },
  { zipcode: "75036", city: "Frisco", lat: 33.17, lng: -96.87 },
  // Plano
  { zipcode: "75023", city: "Plano", lat: 33.045, lng: -96.73 },
  { zipcode: "75024", city: "Plano", lat: 33.08, lng: -96.825 },
  { zipcode: "75025", city: "Plano", lat: 33.09, lng: -96.755 },
  { zipcode: "75074", city: "Plano", lat: 33.03, lng: -96.7 },
  { zipcode: "75075", city: "Plano", lat: 33.04, lng: -96.76 },
  { zipcode: "75093", city: "Plano", lat: 33.03, lng: -96.835 },
  // McKinney
  { zipcode: "75070", city: "McKinney", lat: 33.19, lng: -96.73 },
  { zipcode: "75071", city: "McKinney", lat: 33.22, lng: -96.66 },
  { zipcode: "75072", city: "McKinney", lat: 33.18, lng: -96.62 },
  // Allen
  { zipcode: "75002", city: "Allen", lat: 33.115, lng: -96.62 },
  { zipcode: "75013", city: "Allen", lat: 33.105, lng: -96.69 },
  // Prosper / Little Elm / The Colony
  { zipcode: "75078", city: "Prosper", lat: 33.235, lng: -96.795 },
  { zipcode: "75068", city: "Little Elm", lat: 33.165, lng: -96.91 },
  { zipcode: "75056", city: "The Colony", lat: 33.09, lng: -96.89 },
  // Carrollton
  { zipcode: "75006", city: "Carrollton", lat: 32.95, lng: -96.89 },
  { zipcode: "75007", city: "Carrollton", lat: 32.985, lng: -96.91 },
  { zipcode: "75010", city: "Carrollton", lat: 33.005, lng: -96.87 },
  // Lewisville
  { zipcode: "75057", city: "Lewisville", lat: 33.045, lng: -96.995 },
  { zipcode: "75067", city: "Lewisville", lat: 33.06, lng: -97.005 },
  // Flower Mound
  { zipcode: "75022", city: "Flower Mound", lat: 33.025, lng: -97.115 },
  { zipcode: "75028", city: "Flower Mound", lat: 33.02, lng: -97.085 },
  // Coppell
  { zipcode: "75019", city: "Coppell", lat: 32.965, lng: -97.02 },
  // Grapevine / Southlake / Colleyville
  { zipcode: "76051", city: "Grapevine", lat: 32.935, lng: -97.08 },
  { zipcode: "76092", city: "Southlake", lat: 32.94, lng: -97.135 },
  { zipcode: "76034", city: "Colleyville", lat: 32.89, lng: -97.155 },
  // Keller
  { zipcode: "76244", city: "Keller", lat: 32.965, lng: -97.215 },
  { zipcode: "76248", city: "Keller", lat: 32.935, lng: -97.23 },
  // HEB cities — Hurst / Bedford / Euless
  { zipcode: "76053", city: "Hurst", lat: 32.825, lng: -97.18 },
  { zipcode: "76054", city: "Hurst", lat: 32.86, lng: -97.18 },
  { zipcode: "76021", city: "Bedford", lat: 32.855, lng: -97.14 },
  { zipcode: "76022", city: "Bedford", lat: 32.835, lng: -97.14 },
  { zipcode: "76039", city: "Euless", lat: 32.87, lng: -97.075 },
  { zipcode: "76040", city: "Euless", lat: 32.835, lng: -97.085 },
  // NRH / Watauga / Haltom City / Saginaw
  { zipcode: "76180", city: "North Richland Hills", lat: 32.865, lng: -97.225 },
  { zipcode: "76182", city: "North Richland Hills", lat: 32.89, lng: -97.245 },
  { zipcode: "76137", city: "Watauga", lat: 32.89, lng: -97.25 },
  { zipcode: "76117", city: "Haltom City", lat: 32.815, lng: -97.265 },
  { zipcode: "76179", city: "Saginaw", lat: 32.87, lng: -97.385 },
  // Fort Worth (popular zips)
  { zipcode: "76102", city: "Fort Worth", lat: 32.755, lng: -97.33 },
  { zipcode: "76104", city: "Fort Worth", lat: 32.73, lng: -97.31 },
  { zipcode: "76107", city: "Fort Worth", lat: 32.745, lng: -97.385 },
  { zipcode: "76110", city: "Fort Worth", lat: 32.7, lng: -97.33 },
  { zipcode: "76116", city: "Fort Worth", lat: 32.73, lng: -97.42 },
  { zipcode: "76132", city: "Fort Worth", lat: 32.7, lng: -97.43 },
  // Arlington
  { zipcode: "76001", city: "Arlington", lat: 32.66, lng: -97.13 },
  { zipcode: "76010", city: "Arlington", lat: 32.735, lng: -97.105 },
  { zipcode: "76011", city: "Arlington", lat: 32.755, lng: -97.105 },
  { zipcode: "76012", city: "Arlington", lat: 32.745, lng: -97.135 },
  { zipcode: "76013", city: "Arlington", lat: 32.715, lng: -97.15 },
  { zipcode: "76015", city: "Arlington", lat: 32.695, lng: -97.135 },
  { zipcode: "76016", city: "Arlington", lat: 32.7, lng: -97.165 },
  { zipcode: "76017", city: "Arlington", lat: 32.685, lng: -97.155 },
  { zipcode: "76018", city: "Arlington", lat: 32.665, lng: -97.08 },
  // Mansfield
  { zipcode: "76063", city: "Mansfield", lat: 32.58, lng: -97.14 },
  // Grand Prairie
  { zipcode: "75050", city: "Grand Prairie", lat: 32.77, lng: -97.0 },
  { zipcode: "75051", city: "Grand Prairie", lat: 32.745, lng: -97.01 },
  { zipcode: "75052", city: "Grand Prairie", lat: 32.72, lng: -97.0 },
  // Irving / Las Colinas
  { zipcode: "75038", city: "Irving", lat: 32.86, lng: -96.985 },
  { zipcode: "75039", city: "Irving", lat: 32.88, lng: -96.945 },
  { zipcode: "75060", city: "Irving", lat: 32.815, lng: -96.945 },
  { zipcode: "75061", city: "Irving", lat: 32.835, lng: -96.94 },
  { zipcode: "75062", city: "Irving", lat: 32.86, lng: -96.94 },
  { zipcode: "75063", city: "Irving", lat: 32.91, lng: -96.965 },
  // Dallas (sampling of higher-volume zips)
  { zipcode: "75201", city: "Dallas", lat: 32.78, lng: -96.795 },
  { zipcode: "75204", city: "Dallas", lat: 32.795, lng: -96.785 },
  { zipcode: "75206", city: "Dallas", lat: 32.835, lng: -96.77 },
  { zipcode: "75214", city: "Dallas", lat: 32.825, lng: -96.755 },
  { zipcode: "75218", city: "Dallas", lat: 32.84, lng: -96.715 },
  { zipcode: "75225", city: "Dallas", lat: 32.86, lng: -96.785 },
  { zipcode: "75230", city: "Dallas", lat: 32.905, lng: -96.785 },
  { zipcode: "75231", city: "Dallas", lat: 32.87, lng: -96.755 },
  { zipcode: "75240", city: "Dallas", lat: 32.925, lng: -96.77 },
  { zipcode: "75252", city: "Dallas", lat: 32.985, lng: -96.785 },
  { zipcode: "75287", city: "Dallas", lat: 32.985, lng: -96.825 },
  // Richardson
  { zipcode: "75080", city: "Richardson", lat: 32.945, lng: -96.73 },
  { zipcode: "75081", city: "Richardson", lat: 32.94, lng: -96.7 },
  { zipcode: "75082", city: "Richardson", lat: 32.985, lng: -96.7 },
  // Garland
  { zipcode: "75040", city: "Garland", lat: 32.94, lng: -96.64 },
  { zipcode: "75041", city: "Garland", lat: 32.89, lng: -96.665 },
  { zipcode: "75042", city: "Garland", lat: 32.91, lng: -96.64 },
  { zipcode: "75043", city: "Garland", lat: 32.88, lng: -96.595 },
  { zipcode: "75044", city: "Garland", lat: 32.94, lng: -96.68 },
  // Mesquite / Rowlett / Sachse / Wylie / Murphy
  { zipcode: "75149", city: "Mesquite", lat: 32.77, lng: -96.585 },
  { zipcode: "75150", city: "Mesquite", lat: 32.815, lng: -96.61 },
  { zipcode: "75088", city: "Rowlett", lat: 32.905, lng: -96.555 },
  { zipcode: "75048", city: "Sachse", lat: 32.975, lng: -96.585 },
  { zipcode: "75098", city: "Wylie", lat: 33.015, lng: -96.535 },
  { zipcode: "75094", city: "Murphy", lat: 33.02, lng: -96.61 },
  // Southern suburbs
  { zipcode: "75104", city: "Cedar Hill", lat: 32.585, lng: -96.955 },
  { zipcode: "75115", city: "DeSoto", lat: 32.585, lng: -96.86 },
  { zipcode: "75116", city: "Duncanville", lat: 32.65, lng: -96.91 },
  { zipcode: "75134", city: "Lancaster", lat: 32.595, lng: -96.76 },
];

const ZIP_INDEX: Map<string, ZipEntry> = new Map(
  DFW_ZIPCODES.map((z) => [z.zipcode, z]),
);

export function getZipcodeCoords(
  zipcode: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!zipcode) return null;
  const entry = ZIP_INDEX.get(zipcode);
  return entry ? { lat: entry.lat, lng: entry.lng } : null;
}

export function getZipcodeCity(
  zipcode: string | null | undefined,
): string | null {
  if (!zipcode) return null;
  return ZIP_INDEX.get(zipcode)?.city ?? null;
}

export function isValidZipcodeFormat(s: string): boolean {
  return /^[0-9]{5}$/.test(s);
}
