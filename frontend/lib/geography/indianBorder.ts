export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface BorderReferencePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
  verified: boolean;
}

export interface IndianBorderReference {
  id: string;
  label: string;
  neighbor: string;
  lengthKm: number | null;
  bounds: GeoBounds;
  note: string;
  points: BorderReferencePoint[];
}

export const DEMO_GEO_BOUNDS: GeoBounds = {
  minLat: 31.615,
  maxLat: 31.692,
  minLng: 74.862,
  maxLng: 74.948,
};

export const INDIAN_TERRITORY_BOUNDS: GeoBounds = {
  minLat: 6.7468,
  maxLat: 35.6745,
  minLng: 68.1941,
  maxLng: 97.3956,
};

// Reference envelopes and landmarks extracted from the supplied
// "Longitude and Latitude of Indian Border" document. These are mapping
// references for geotagging, not live boundary telemetry or legal survey data.
export const INDIAN_BORDER_REFERENCES: IndianBorderReference[] = [
  {
    id: "DEMO-PUNJAB",
    label: "Current Demo Area // Punjab",
    neighbor: "Pakistan",
    lengthKm: null,
    bounds: DEMO_GEO_BOUNDS,
    note: "Existing BorderLens demonstration area around the Punjab camera sample.",
    points: [],
  },
  {
    id: "PAKISTAN",
    label: "Pakistan Border // Western Sector",
    neighbor: "Pakistan",
    lengthKm: 3323,
    bounds: { minLat: 23.62, maxLat: 35.68, minLng: 68.19, maxLng: 77.05 },
    note: "Reference envelope for the western border, including international boundary and LoC/AGPL reference areas.",
    points: [
      { id: "WAGAH", name: "Wagah", lat: 31.60472, lng: 74.57306, verified: true },
      { id: "ATTARI", name: "Attari", lat: 31.60083, lng: 74.60556, verified: true },
      { id: "HUSSAINIWALA", name: "Hussainiwala", lat: 30.9976556, lng: 74.5471167, verified: true },
      { id: "MUNABAO", name: "Munabao", lat: 25.75, lng: 70.2833, verified: true },
      { id: "LONGEWALA", name: "Longewala", lat: 27.52306, lng: 70.15444, verified: true },
      { id: "SIR_CREEK", name: "Sir Creek", lat: 23.967, lng: 68.8, verified: true },
      { id: "NJ9842", name: "Point NJ9842 // AGPL start", lat: 35.008371, lng: 77.008805, verified: true },
      { id: "INDIRA_COL", name: "Indira Col", lat: 35.6644, lng: 76.7978, verified: true },
      { id: "SIA_KANGRI", name: "Sia Kangri", lat: 35.66361, lng: 76.76139, verified: true },
    ],
  },
  {
    id: "CHINA-WEST",
    label: "China Border // Western Sector",
    neighbor: "China",
    lengthKm: null,
    bounds: { minLat: 32.55, maxLat: 35.68, minLng: 76.8, maxLng: 80.4 },
    note: "Evaluate separately from the eastern sector; the source document warns against using one China-border box.",
    points: [
      { id: "KARAKORAM_PASS", name: "Karakoram Pass", lat: 35.5133, lng: 77.8231, verified: true },
      { id: "DEMCHOK", name: "Demchok, Ladakh", lat: 32.7038, lng: 79.4467, verified: true },
    ],
  },
  {
    id: "CHINA-EAST",
    label: "China Border // Eastern Sector",
    neighbor: "China",
    lengthKm: null,
    bounds: { minLat: 26.9, maxLat: 29.5, minLng: 91.6, maxLng: 97.42 },
    note: "Reference envelope for the eastern sector across Sikkim and Arunachal Pradesh.",
    points: [
      { id: "SHIPKI_LA", name: "Shipki La", lat: 31.83194, lng: 78.73389, note: "Outside the eastern envelope; retained as a national reference point.", verified: true },
      { id: "LIPULEKH", name: "Lipulekh Pass", lat: 30.2329, lng: 81.0285, note: "National reference point; select the relevant sector for precise viewing.", verified: true },
      { id: "NATHU_LA", name: "Nathu La", lat: 27.38681, lng: 88.83095, verified: true },
      { id: "BUM_LA", name: "Bum La Pass", lat: 27.7236979, lng: 91.8916106, verified: true },
      { id: "KIBITHU", name: "Kibithu", lat: 28.28028, lng: 97.01778, verified: true },
      { id: "DIPHU_PASS", name: "Diphu Pass tri-junction", lat: 28.15, lng: 97.33333, verified: true },
    ],
  },
  {
    id: "NEPAL",
    label: "Nepal Border",
    neighbor: "Nepal",
    lengthKm: 1751,
    bounds: { minLat: 26.35, maxLat: 30.42, minLng: 80.03, maxLng: 88.2 },
    note: "Reference envelope for the open-border geotagging context.",
    points: [
      { id: "SONAULI", name: "Sonauli", lat: 27.473806, lng: 83.46913, verified: true },
      { id: "RAXAUL", name: "Raxaul", lat: 26.9833, lng: 84.85, verified: true },
      { id: "BANBASA", name: "Banbasa", lat: 28.979913, lng: 80.080032, verified: true },
      { id: "JOGBANI", name: "Jogbani", lat: 26.39611, lng: 87.25972, verified: true },
      { id: "PANITANKI", name: "Panitanki", lat: 26.64, lng: 88.17, verified: true },
    ],
  },
  {
    id: "BHUTAN",
    label: "Bhutan Border",
    neighbor: "Bhutan",
    lengthKm: 699,
    bounds: { minLat: 26.7, maxLat: 28.35, minLng: 88.75, maxLng: 92.15 },
    note: "Reference envelope for northern West Bengal, Assam, and Arunachal border context.",
    points: [
      { id: "JAIGAON", name: "Jaigaon", lat: 26.83, lng: 89.38, verified: true },
      { id: "PHUENTSHOLING", name: "Phuentsholing", lat: 26.85, lng: 89.38333, verified: true },
      { id: "GELEPHU", name: "Gelephu", lat: 26.87056, lng: 90.48556, verified: true },
      { id: "SAMDRUP_JONGKHAR", name: "Samdrup Jongkhar", lat: 26.8, lng: 91.505, verified: true },
    ],
  },
  {
    id: "BANGLADESH",
    label: "Bangladesh Border",
    neighbor: "Bangladesh",
    lengthKm: 4096.7,
    bounds: { minLat: 21.6, maxLat: 26.65, minLng: 88, maxLng: 92.7 },
    note: "Reference envelope across West Bengal, Meghalaya, Assam, Tripura, and Mizoram.",
    points: [
      { id: "PETRAPOLE", name: "Petrapole", lat: 23, lng: 88.83, verified: true },
      { id: "GHOJADANGA", name: "Ghojadanga", lat: 22.673222, lng: 88.946167, verified: true },
      { id: "HILI", name: "Hili", lat: 25.286, lng: 88.994, verified: true },
      { id: "TIN_BIGHA", name: "Tin Bigha Corridor", lat: 26.30028, lng: 88.94528, verified: true },
      { id: "DAWKI", name: "Dawki", lat: 25.18333, lng: 92.01667, verified: true },
      { id: "AKHAURA", name: "Akhaura land port", lat: 23.86806, lng: 91.20833, verified: true },
    ],
  },
  {
    id: "MYANMAR",
    label: "Myanmar Border",
    neighbor: "Myanmar",
    lengthKm: 1643,
    bounds: { minLat: 21.95, maxLat: 28.35, minLng: 92.55, maxLng: 97.42 },
    note: "Reference envelope across Arunachal Pradesh, Nagaland, Manipur, and Mizoram.",
    points: [
      { id: "ZOKHAWTHAR", name: "Zokhawthar Land Customs Station", lat: 23.3652465, lng: 93.3855078, verified: true },
      { id: "MOREH", name: "Moreh, Manipur", lat: 24.25, lng: 94.31, note: "Approximate point; re-verify before operational use.", verified: false },
    ],
  },
  {
    id: "AFGHANISTAN-CLAIMED",
    label: "Claimed Afghanistan Frontier",
    neighbor: "Afghanistan",
    lengthKm: 106,
    bounds: { minLat: 36.75, maxLat: 37.09, minLng: 74.35, maxLng: 75.05 },
    note: "Claimed reference area in Pakistan-occupied Kashmir/Wakhan context; not an administered border segment.",
    points: [
      { id: "KILIK_PASS", name: "East of Kilik Pass", lat: 37.08586, lng: 74.70291, note: "Claimed anchor; treat as a reference point, not an administered border location.", verified: true },
    ],
  },
];

export const INDIAN_BORDER_LANDMARKS = INDIAN_BORDER_REFERENCES.flatMap((reference) =>
  reference.points.map((point) => ({ ...point, borderId: reference.id, borderLabel: reference.label }))
);

export const getBorderReference = (id: string) =>
  INDIAN_BORDER_REFERENCES.find((reference) => reference.id === id) || INDIAN_BORDER_REFERENCES[0];

export const formatGeoBounds = (bounds: GeoBounds) =>
  `${bounds.minLat.toFixed(2)}–${bounds.maxLat.toFixed(2)}° N // ${bounds.minLng.toFixed(2)}–${bounds.maxLng.toFixed(2)}° E`;
