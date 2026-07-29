export interface Category {
  key: string;
  name: string;
  color: string;
  price: number;
  icon: string;
  subcategories: Subcategory[];
}

export interface Subcategory {
  key: string;
  name: string;
}

export const SERVICE_CATALOG: Category[] = [
  {
    key: 'cleaning',
    name: 'Cleaning',
    color: '#3b82f6',
    price: 300,
    icon: 'sparkles-outline',
    subcategories: [
      { key: 'basic_home', name: 'Basic Home' },
      { key: 'kitchen', name: 'Kitchen' },
      { key: 'bathroom', name: 'Bathroom' },
      { key: 'deep_cleaning', name: 'Deep Cleaning' },
      { key: 'sofa_carpet', name: 'Sofa & Carpet' },
      { key: 'office_commercial', name: 'Office / Commercial' },
      { key: 'post_construction', name: 'Post Construction' },
    ],
  },
  {
    key: 'electrical',
    name: 'Electrical',
    color: '#f59e0b',
    price: 400,
    icon: 'flash-outline',
    subcategories: [
      { key: 'wiring', name: 'Wiring' },
      { key: 'fan_installation', name: 'Fan Installation' },
      { key: 'switch_socket', name: 'Switch & Socket' },
      { key: 'appliance_repair', name: 'Appliance Repair' },
      { key: 'lighting', name: 'Lighting' },
    ],
  },
  {
    key: 'cooking',
    name: 'Cooking',
    color: '#ef4444',
    price: 350,
    icon: 'restaurant-outline',
    subcategories: [
      { key: 'north_indian', name: 'North Indian' },
      { key: 'south_indian', name: 'South Indian' },
      { key: 'tiffin_service', name: 'Tiffin Service' },
      { key: 'party_cooking', name: 'Party Cooking' },
    ],
  },
  {
    key: 'plumbing',
    name: 'Plumbing',
    color: '#8b5cf6',
    price: 450,
    icon: 'water-outline',
    subcategories: [
      { key: 'tap_repair', name: 'Tap Repair' },
      { key: 'pipe_fitting', name: 'Pipe Fitting' },
      { key: 'drainage', name: 'Drainage' },
      { key: 'water_tank', name: 'Water Tank' },
    ],
  },
  {
    key: 'carpentry',
    name: 'Carpentry',
    color: '#a16207',
    price: 500,
    icon: 'hammer-outline',
    subcategories: [
      { key: 'furniture_repair', name: 'Furniture Repair' },
      { key: 'door_window', name: 'Door & Window' },
      { key: 'modular_furniture', name: 'Modular Furniture' },
      { key: 'polishing', name: 'Polishing' },
    ],
  },
  {
    key: 'ac_repair',
    name: 'AC Repair',
    color: '#0ea5e9',
    price: 600,
    icon: 'snow-outline',
    subcategories: [
      { key: 'installation', name: 'Installation' },
      { key: 'servicing', name: 'Servicing' },
      { key: 'gas_refill', name: 'Gas Refill' },
      { key: 'uninstallation', name: 'Uninstallation' },
    ],
  },
  {
    key: 'painting',
    name: 'Painting',
    color: '#10b981',
    price: 800,
    icon: 'color-palette-outline',
    subcategories: [
      { key: 'interior', name: 'Interior' },
      { key: 'exterior', name: 'Exterior' },
      { key: 'texture', name: 'Texture' },
      { key: 'waterproofing', name: 'Waterproofing' },
    ],
  },
  {
    key: 'pest_control',
    name: 'Pest Control',
    color: '#14b8a6',
    price: 500,
    icon: 'bug-outline',
    subcategories: [
      { key: 'cockroach', name: 'Cockroach' },
      { key: 'termite', name: 'Termite' },
      { key: 'rodent', name: 'Rodent' },
      { key: 'mosquito', name: 'Mosquito' },
    ],
  },
];

export function getCategoryByKey(key: string): Category | undefined {
  return SERVICE_CATALOG.find((c) => c.key === key);
}
