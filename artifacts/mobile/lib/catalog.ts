/**
 * Kaaryo service catalog.
 *
 * Modelled on India's 10-minute house-help apps: small, concretely-named tasks
 * priced per slot (30/60/90 min) rather than broad trade categories, so a user
 * can stack several tasks into one visit. Trade work still exists, but lives in
 * the `repairs` group where instant dispatch does not apply.
 */

import type { ComponentProps } from 'react';
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export type MdiName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type IonName = ComponentProps<typeof Ionicons>['name'];

/** Which shelf a service sits on, and how it can be dispatched. */
export type ServiceGroupKey = 'house_help' | 'deep_clean' | 'repairs';

/**
 * The categories the booking backend accepts.
 *
 * `POST /api/user/service-requests` validates `category` against its own catalog
 * and prices the job from its own rate card, so these eight keys — not this
 * file's service keys — are what an instant booking is actually placed under.
 * The live names, prices and subcategories come from `GET /api/services`; this
 * type only pins down the mapping.
 */
export type RemoteCategoryKey =
  | 'cleaning'
  | 'electrical'
  | 'cooking'
  | 'plumbing'
  | 'carpentry'
  | 'ac_repair'
  | 'painting'
  | 'pest_control';

export interface ServiceGroup {
  key: ServiceGroupKey;
  title: string;
  subtitle: string;
  /** Instant (10-min arrival) is only offered for short, tool-light tasks. */
  supportsInstant: boolean;
}

export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    key: 'house_help',
    title: 'All house help services',
    subtitle: 'One expert who can do it all — arriving in 10 minutes',
    supportsInstant: true,
  },
  {
    key: 'deep_clean',
    title: 'Deep cleaning',
    subtitle: 'Machine-assisted jobs — book a slot that suits you',
    supportsInstant: false,
  },
  {
    key: 'repairs',
    title: 'Repairs & maintenance',
    subtitle: 'Verified technicians, upfront visit charges',
    supportsInstant: false,
  },
];

/** A bookable duration slot for a service. */
export interface DurationOption {
  key: string;
  label: string;
  minutes: number;
  price: number;
  /** Shown as a strike-through next to `price` when present. */
  strikePrice?: number;
}

export interface Service {
  key: string;
  name: string;
  /** Two-line-safe label for the compact home grid. */
  gridName: string;
  group: ServiceGroupKey;
  icon: MdiName;
  /** One-liner under the title on the detail screen. */
  tagline: string;
  description: string;
  /** Starting price — matches `durations[0].price`. */
  price: number;
  durations: DurationOption[];
  includes: string[];
  /**
   * The concrete tasks inside a service — "Kitchen floor", "WC & seat".
   *
   * Instant dispatch sends one expert straight to the door with no cart review
   * in between, so the brief has to be pinned down before they leave: these are
   * the chips the instant sheet asks the customer to tick. Services that do not
   * define them fall back to `includes` (see `getSubcategories`).
   */
  subcategories?: string[];
  /** Corner ribbon on the grid tile, e.g. a live offer. */
  offer?: string;
  popular?: boolean;
  rating: number;
  /** Social proof string, pre-formatted in Indian numbering. */
  bookings: string;
}

// ─── House help ───────────────────────────────────────────────────────────────

const HOUSE_HELP: Service[] = [
  {
    key: 'sweeping',
    name: 'Sweeping',
    gridName: 'Sweeping',
    group: 'house_help',
    icon: 'broom',
    tagline: 'Dry sweep across every room',
    description:
      'Your expert sweeps all floors, corners and under reachable furniture, then bags and disposes of the dust.',
    price: 149,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 149 },
      { key: '60', label: '1 hour', minutes: 60, price: 269 },
    ],
    includes: ['All rooms swept', 'Corners and skirting', 'Dust bagged & disposed'],
    subcategories: [
      'Living room',
      'Bedrooms',
      'Kitchen floor',
      'Balcony',
      'Stairs & lobby',
      'Under furniture',
    ],
    rating: 4.8,
    bookings: '3.4L+ bookings',
  },
  {
    key: 'sweeping_mopping',
    name: 'Sweeping & mopping',
    gridName: 'Sweeping &\nmopping',
    group: 'house_help',
    icon: 'bucket-outline',
    tagline: 'Sweep, then wet-mop with floor cleaner',
    description:
      'The most-booked task on Kaaryo. Sweeping followed by a wet mop using your floor cleaner — or ours, at no extra cost.',
    price: 199,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 199 },
      { key: '60', label: '1 hour', minutes: 60, price: 349, strikePrice: 399 },
      { key: '90', label: '90 min', minutes: 90, price: 499 },
    ],
    includes: [
      'Dry sweep + wet mop',
      'Floor cleaner included',
      'Balcony floors on request',
    ],
    subcategories: [
      'Whole house',
      'Living room',
      'Bedrooms',
      'Kitchen floor',
      'Bathroom floor',
      'Balcony',
    ],
    popular: true,
    rating: 4.9,
    bookings: '8.1L+ bookings',
  },
  {
    key: 'dusting',
    name: 'Dusting & wiping',
    gridName: 'Dusting &\nwiping',
    group: 'house_help',
    icon: 'spray-bottle',
    tagline: 'Surfaces, shelves and switchboards',
    description:
      'Microfibre dusting and wiping of tables, shelves, TV units, switchboards, door frames and window sills.',
    price: 179,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 179 },
      { key: '60', label: '1 hour', minutes: 60, price: 319 },
    ],
    includes: ['Microfibre cloth & polish', 'Shelves and TV units', 'Switchboards & frames'],
    subcategories: [
      'Shelves & tables',
      'TV unit',
      'Switchboards',
      'Door & window frames',
      'Window sills',
      'Showpieces & frames',
    ],
    rating: 4.8,
    bookings: '2.6L+ bookings',
  },
  {
    key: 'bathroom',
    name: 'Bathroom cleaning',
    gridName: 'Bathroom',
    group: 'house_help',
    icon: 'shower',
    tagline: 'Hygienic bathroom, top to bottom',
    description:
      'Scrubbing of the WC, wash basin, taps, tiles and floors with a hospital-grade disinfectant. Mirrors polished, drain hair cleared.',
    price: 249,
    durations: [
      { key: '30', label: '1 bathroom · 30 min', minutes: 30, price: 249, strikePrice: 299 },
      { key: '60', label: '2 bathrooms · 1 hour', minutes: 60, price: 449 },
    ],
    includes: [
      'WC, basin, taps & tiles scrubbed',
      'Disinfectant included',
      'Mirror polish + drain clearing',
    ],
    subcategories: [
      'WC & seat',
      'Wash basin',
      'Tiles & walls',
      'Floor scrub',
      'Mirror & fittings',
      'Drain clearing',
    ],
    offer: '₹50 OFF',
    popular: true,
    rating: 4.9,
    bookings: '5.2L+ bookings',
  },
  {
    key: 'utensils',
    name: 'Utensils & dishwashing',
    gridName: 'Utensils',
    group: 'house_help',
    icon: 'silverware-clean',
    tagline: 'Sink cleared, dishes stacked away',
    description:
      'All pending utensils washed, dried and stacked back. Sink and draining board wiped down at the end.',
    price: 169,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 169 },
      { key: '60', label: '1 hour', minutes: 60, price: 299 },
    ],
    includes: ['Wash, dry & stack', 'Dishwash liquid included', 'Sink & board wiped'],
    subcategories: [
      'Sink pile',
      'Cookware & kadhai',
      'Glassware',
      'Lunch boxes',
      'Stack & put away',
      'Sink & board wipe',
    ],
    popular: true,
    rating: 4.8,
    bookings: '6.7L+ bookings',
  },
  {
    key: 'laundry',
    name: 'Laundry & folding',
    gridName: 'Laundry &\nfolding',
    group: 'house_help',
    icon: 'washing-machine',
    tagline: 'Machine load, dry and fold',
    description:
      'Your expert sorts, loads and runs your washing machine, then hangs the load out and folds what is already dry.',
    price: 199,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 199 },
      { key: '60', label: '1 hour', minutes: 60, price: 349 },
    ],
    includes: ['Sort & load machine', 'Hang to dry', 'Fold and stack dry clothes'],
    subcategories: [
      'Machine wash load',
      'Hand wash delicates',
      'Hang out to dry',
      'Fold & stack',
      'Bedsheets & towels',
    ],
    rating: 4.7,
    bookings: '2.1L+ bookings',
  },
  {
    key: 'ironing',
    name: 'Ironing',
    gridName: 'Ironing',
    group: 'house_help',
    icon: 'iron',
    tagline: 'Crisp clothes, neatly hung',
    description:
      'Pressing of shirts, trousers, kurtas and sarees using your iron and board, finished on hangers.',
    price: 189,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 189 },
      { key: '60', label: '1 hour', minutes: 60, price: 329 },
    ],
    includes: ['Up to 15 garments per 30 min', 'Hung on hangers', 'Delicates on request'],
    subcategories: [
      'Shirts & tops',
      'Trousers & jeans',
      'Kurtas & ethnic',
      'Sarees & dupattas',
      'School uniforms',
      'Bedsheets',
    ],
    rating: 4.7,
    bookings: '96K+ bookings',
  },
  {
    key: 'kitchen',
    name: 'Kitchen cleaning',
    gridName: 'Kitchen',
    group: 'house_help',
    icon: 'stove',
    tagline: 'Degreased slabs, stove and sink',
    description:
      'Degreasing of the platform, stove top, backsplash tiles and sink. Cabinet fronts wiped and the floor mopped.',
    price: 279,
    durations: [
      { key: '45', label: '45 min', minutes: 45, price: 279 },
      { key: '90', label: '90 min', minutes: 90, price: 499 },
    ],
    includes: ['Slab & stove degreased', 'Backsplash tiles', 'Cabinet fronts wiped'],
    subcategories: [
      'Platform & slab',
      'Stove & burners',
      'Backsplash tiles',
      'Sink & taps',
      'Cabinet fronts',
      'Chimney exterior',
      'Floor mop',
    ],
    rating: 4.8,
    bookings: '3.9L+ bookings',
  },
  {
    key: 'window',
    name: 'Window cleaning',
    gridName: 'Window',
    group: 'house_help',
    icon: 'window-closed-variant',
    tagline: 'Glass, grills and sills',
    description:
      'Inside-face glass, grills, mesh and sills cleaned with a squeegee and glass cleaner. Exterior faces only where safely reachable.',
    price: 229,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 229, strikePrice: 279 },
      { key: '60', label: '1 hour', minutes: 60, price: 419 },
    ],
    includes: ['Glass cleaner & squeegee', 'Grills and mesh', 'Sills wiped dry'],
    subcategories: [
      'Glass panes',
      'Grills',
      'Mosquito mesh',
      'Sills & tracks',
      'Balcony railing',
    ],
    offer: '₹50 OFF',
    rating: 4.7,
    bookings: '74K+ bookings',
  },
  {
    key: 'staircase',
    name: 'Staircase cleaning',
    gridName: 'Staircase',
    group: 'house_help',
    icon: 'stairs',
    tagline: 'Steps, railings and landings',
    description:
      'Sweeping and mopping of internal stairs, with railings and landings wiped down.',
    price: 209,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 209 },
      { key: '60', label: '1 hour', minutes: 60, price: 369 },
    ],
    includes: ['Steps swept & mopped', 'Railings wiped', 'Landings included'],
    subcategories: ['Steps sweep', 'Steps mop', 'Railings', 'Landings', 'Lobby area'],
    rating: 4.6,
    bookings: '41K+ bookings',
  },
  {
    key: 'fridge',
    name: 'Fridge cleaning',
    gridName: 'Fridge',
    group: 'house_help',
    icon: 'fridge-outline',
    tagline: 'Shelves out, wiped, restacked',
    description:
      'Shelves and trays removed and washed, interior deodorised, and everything restacked the way you had it.',
    price: 249,
    durations: [{ key: '45', label: '45 min', minutes: 45, price: 249 }],
    includes: ['Shelves & trays washed', 'Interior deodorised', 'Contents restacked'],
    subcategories: [
      'Shelves & trays',
      'Freezer',
      'Door pockets',
      'Vegetable drawer',
      'Deodorise',
      'Restack contents',
    ],
    rating: 4.8,
    bookings: '38K+ bookings',
  },
  {
    key: 'organising',
    name: 'Organising & decluttering',
    gridName: 'Organising',
    group: 'house_help',
    icon: 'wardrobe-outline',
    tagline: 'Wardrobes and shelves, sorted',
    description:
      'Folding, sorting and re-stacking of wardrobes, kids’ shelves and storage boxes — your call on what stays.',
    price: 299,
    durations: [
      { key: '60', label: '1 hour', minutes: 60, price: 299 },
      { key: '90', label: '90 min', minutes: 90, price: 429 },
    ],
    includes: ['Fold & re-stack', 'Category-wise sorting', 'Discard pile set aside'],
    subcategories: [
      'Wardrobe',
      "Kids' shelves",
      'Kitchen cabinets',
      'Storage boxes',
      'Shoe rack',
      'Study table',
    ],
    rating: 4.8,
    bookings: '29K+ bookings',
  },
  {
    key: 'cooking',
    name: 'Cooking help',
    gridName: 'Cooking\nhelp',
    group: 'house_help',
    icon: 'pot-steam-outline',
    tagline: 'Prep, cook and clean up',
    description:
      'Vegetable prep, roti and a two-dish meal from your kitchen’s ingredients, with the cooking area cleaned up after.',
    price: 349,
    durations: [
      { key: '60', label: '1 hour', minutes: 60, price: 349 },
      { key: '90', label: '90 min', minutes: 90, price: 499 },
    ],
    includes: ['Veg prep & chopping', 'Roti + 2 dishes', 'Cooking area cleaned'],
    subcategories: [
      'Veg prep & chopping',
      'Roti / paratha',
      'Dal & sabzi',
      'Rice & curry',
      'Breakfast',
      'Clean-up after',
    ],
    rating: 4.7,
    bookings: '1.3L+ bookings',
  },
  {
    key: 'pet_care',
    name: 'Pet care & walking',
    gridName: 'Pet care',
    group: 'house_help',
    icon: 'dog-side',
    tagline: 'A walk, a bowl, a clean litter tray',
    description:
      'A 30-minute walk, fresh food and water, and litter tray or crate cleaning by a pet-comfortable expert.',
    price: 229,
    durations: [
      { key: '30', label: '30 min', minutes: 30, price: 229 },
      { key: '60', label: '1 hour', minutes: 60, price: 399 },
    ],
    includes: ['Supervised walk', 'Food & water refresh', 'Litter tray cleaned'],
    subcategories: [
      'Walk',
      'Feed & water',
      'Litter tray',
      'Brush & wipe',
      'Crate / bedding',
      'Play time',
    ],
    rating: 4.9,
    bookings: '22K+ bookings',
  },
];

// ─── Deep cleaning ────────────────────────────────────────────────────────────

const DEEP_CLEAN: Service[] = [
  {
    key: 'deep_home',
    name: 'Full home deep clean',
    gridName: 'Full home\ndeep clean',
    group: 'deep_clean',
    icon: 'home-variant-outline',
    tagline: 'A 2-expert reset for the whole house',
    description:
      'A two-person crew covers every room, bathroom and the kitchen with machines, degreasers and disinfectant. Allow 4–5 hours for a 2BHK.',
    price: 2499,
    durations: [
      { key: '1bhk', label: '1 BHK · 3–4 hrs', minutes: 210, price: 2499 },
      { key: '2bhk', label: '2 BHK · 4–5 hrs', minutes: 270, price: 3499, strikePrice: 3999 },
      { key: '3bhk', label: '3 BHK · 6 hrs', minutes: 360, price: 4699 },
    ],
    includes: [
      '2 trained experts',
      'Machines & chemicals included',
      'Bathrooms + kitchen degreased',
      'Balconies and windows',
    ],
    offer: 'SAVE ₹500',
    popular: true,
    rating: 4.8,
    bookings: '87K+ bookings',
  },
  {
    key: 'sofa_carpet',
    name: 'Sofa & carpet shampoo',
    gridName: 'Sofa &\ncarpet',
    group: 'deep_clean',
    icon: 'sofa-outline',
    tagline: 'Wet vacuum, stains lifted',
    description:
      'Foam shampoo and wet-vacuum extraction on upholstery and carpets. Dries in 4–6 hours.',
    price: 799,
    durations: [
      { key: '3seat', label: '3-seater · 60 min', minutes: 60, price: 799 },
      { key: '5seat', label: '5-seater · 90 min', minutes: 90, price: 1199 },
      { key: 'carpet', label: 'Carpet up to 6x4 · 60 min', minutes: 60, price: 899 },
    ],
    includes: ['Wet vacuum extraction', 'Stain treatment', 'Deodoriser finish'],
    rating: 4.7,
    bookings: '54K+ bookings',
  },
  {
    key: 'fan_cleaning',
    name: 'Fan & light cleaning',
    gridName: 'Fan &\nlights',
    group: 'deep_clean',
    icon: 'fan',
    tagline: 'Blades, rods and fixtures',
    description:
      'Ladder-assisted cleaning of ceiling fan blades and rods, plus light fixtures and exhaust fans.',
    price: 399,
    durations: [
      { key: '4', label: 'Up to 4 fans · 45 min', minutes: 45, price: 399 },
      { key: '8', label: 'Up to 8 fans · 90 min', minutes: 90, price: 699 },
    ],
    includes: ['Ladder brought along', 'Blades and rods', 'Light fixtures & exhausts'],
    rating: 4.7,
    bookings: '61K+ bookings',
  },
  {
    key: 'bathroom_deep',
    name: 'Bathroom deep clean',
    gridName: 'Bathroom\ndeep clean',
    group: 'deep_clean',
    icon: 'bathtub-outline',
    tagline: 'Hard water stains and grout',
    description:
      'Acid-free descaling of hard-water stains, grout scrubbing, and machine polishing of tiles and fittings.',
    price: 649,
    durations: [
      { key: '1', label: '1 bathroom · 75 min', minutes: 75, price: 649 },
      { key: '2', label: '2 bathrooms · 150 min', minutes: 150, price: 1149 },
    ],
    includes: ['Hard-water descaling', 'Grout scrubbing', 'Machine tile polish'],
    rating: 4.8,
    bookings: '72K+ bookings',
  },
  {
    key: 'mattress',
    name: 'Mattress deep clean',
    gridName: 'Mattress',
    group: 'deep_clean',
    icon: 'bed-outline',
    tagline: 'Dust mites and sweat stains',
    description:
      'UV and vacuum treatment followed by foam shampoo on both faces of the mattress.',
    price: 699,
    durations: [
      { key: 'queen', label: 'Queen · 60 min', minutes: 60, price: 699 },
      { key: 'king', label: 'King · 75 min', minutes: 75, price: 849 },
    ],
    includes: ['UV + vacuum treatment', 'Both faces shampooed', 'Anti-allergen finish'],
    rating: 4.7,
    bookings: '31K+ bookings',
  },
  {
    key: 'water_tank',
    name: 'Water tank cleaning',
    gridName: 'Water\ntank',
    group: 'deep_clean',
    icon: 'water-outline',
    tagline: 'Drained, scrubbed, sanitised',
    description:
      'Tank drained, sludge removed, walls scrubbed and the surface sanitised before refilling.',
    price: 1099,
    durations: [
      { key: '500', label: 'Up to 500 L · 90 min', minutes: 90, price: 1099 },
      { key: '1000', label: 'Up to 1000 L · 120 min', minutes: 120, price: 1499 },
    ],
    includes: ['Sludge removal', 'Wall scrubbing', 'Food-safe sanitiser'],
    rating: 4.6,
    bookings: '18K+ bookings',
  },
];

// ─── Repairs ──────────────────────────────────────────────────────────────────

const REPAIRS: Service[] = [
  {
    key: 'electrical',
    name: 'Electrician',
    gridName: 'Electrician',
    group: 'repairs',
    icon: 'flash-outline',
    tagline: 'Wiring, fans, switches, lights',
    description:
      'Licensed electricians for switchboards, fan and light installation, MCB trips and appliance points. The visit charge adjusts against the repair.',
    price: 199,
    durations: [{ key: 'visit', label: 'Inspection visit', minutes: 30, price: 199 }],
    includes: ['Licensed electrician', 'Diagnosis on the spot', 'Visit fee adjusted in repair'],
    rating: 4.7,
    bookings: '1.9L+ bookings',
  },
  {
    key: 'plumbing',
    name: 'Plumber',
    gridName: 'Plumber',
    group: 'repairs',
    icon: 'pipe-wrench',
    tagline: 'Leaks, taps, drains, flush tanks',
    description:
      'Tap and mixer replacement, blocked drains, flush tank repair and leak tracing. Parts billed at MRP.',
    price: 199,
    durations: [{ key: 'visit', label: 'Inspection visit', minutes: 30, price: 199 }],
    includes: ['Leak tracing', 'Drain machine on request', 'Parts at MRP'],
    rating: 4.7,
    bookings: '2.2L+ bookings',
  },
  {
    key: 'carpentry',
    name: 'Carpenter',
    gridName: 'Carpenter',
    group: 'repairs',
    icon: 'hammer-wrench',
    tagline: 'Hinges, drawers, doors, fittings',
    description:
      'Door and window alignment, hinge and channel replacement, wall mounting and modular repairs.',
    price: 249,
    durations: [{ key: 'visit', label: 'Inspection visit', minutes: 30, price: 249 }],
    includes: ['Power tools included', 'Hardware at MRP', 'Wall mounting'],
    rating: 4.6,
    bookings: '1.1L+ bookings',
  },
  {
    key: 'ac_repair',
    name: 'AC service & repair',
    gridName: 'AC service',
    group: 'repairs',
    icon: 'air-conditioner',
    tagline: 'Jet service, gas, installation',
    description:
      'Foam jet servicing, gas top-up, coil cleaning and installation or uninstallation for split and window units.',
    price: 549,
    durations: [
      { key: 'service', label: 'Jet service · 1 unit', minutes: 60, price: 549 },
      { key: 'gas', label: 'Gas refill · 1 unit', minutes: 90, price: 2199 },
      { key: 'install', label: 'Installation · 1 unit', minutes: 120, price: 1499 },
    ],
    includes: ['Foam jet machine', 'Drain flush', '30-day service warranty'],
    popular: true,
    rating: 4.8,
    bookings: '1.6L+ bookings',
  },
  {
    key: 'painting',
    name: 'Painting',
    gridName: 'Painting',
    group: 'repairs',
    icon: 'format-paint',
    tagline: 'Rooms, ceilings, touch-ups',
    description:
      'Free site measurement, then per-sq-ft pricing for putty, primer and two coats. Furniture covered and floors masked.',
    price: 0,
    durations: [{ key: 'survey', label: 'Free site measurement', minutes: 30, price: 0 }],
    includes: ['Free measurement', 'Furniture covered', 'Per-sq-ft quote before start'],
    rating: 4.6,
    bookings: '46K+ bookings',
  },
  {
    key: 'pest_control',
    name: 'Pest control',
    gridName: 'Pest\ncontrol',
    group: 'repairs',
    icon: 'bug-outline',
    tagline: 'Cockroach, termite, mosquito',
    description:
      'Odourless gel and spray treatment with a 60-day warranty. Safe for children and pets after a 2-hour gap.',
    price: 899,
    durations: [
      { key: 'general', label: 'General · 1–2 BHK', minutes: 60, price: 899 },
      { key: 'termite', label: 'Termite · 1–2 BHK', minutes: 150, price: 2699 },
    ],
    includes: ['Odourless chemicals', '60-day warranty', 'Child & pet safe'],
    rating: 4.7,
    bookings: '58K+ bookings',
  },
  {
    key: 'handyman',
    name: 'Handyman tasks',
    gridName: 'Handyman',
    group: 'repairs',
    icon: 'tools',
    tagline: 'The small jobs on your list',
    description:
      'Curtain rods, photo frames, TV mounts, bulb changes, furniture assembly — bundle several into one visit.',
    price: 299,
    durations: [
      { key: '60', label: '1 hour', minutes: 60, price: 299 },
      { key: '120', label: '2 hours', minutes: 120, price: 549 },
    ],
    includes: ['Own tool kit', 'Multiple tasks per visit', 'Debris cleared'],
    rating: 4.7,
    bookings: '67K+ bookings',
  },
];

export const SERVICES: Service[] = [...HOUSE_HELP, ...DEEP_CLEAN, ...REPAIRS];

// ─── Bundles ──────────────────────────────────────────────────────────────────

export interface Bundle {
  key: string;
  name: string;
  description: string;
  /** Keys into `SERVICES` — the tasks the single expert performs. */
  serviceKeys: string[];
  icon: MdiName;
  minutes: number;
  price: number;
  strikePrice: number;
  badge: string;
}

export const BUNDLES: Bundle[] = [
  {
    key: 'daily_essentials',
    name: 'Daily essential cleaning bundle',
    description: 'Sweeping, mopping and utensils with a single booking',
    serviceKeys: ['sweeping_mopping', 'utensils'],
    icon: 'shimmer',
    minutes: 90,
    price: 549,
    strikePrice: 699,
    badge: 'SAVE ₹150',
  },
  {
    key: 'weekly_reset',
    name: 'Weekly home reset bundle',
    description: 'Dusting, bathroom and kitchen — one expert, one visit',
    serviceKeys: ['dusting', 'bathroom', 'kitchen'],
    icon: 'home-heart',
    minutes: 150,
    price: 899,
    strikePrice: 1149,
    badge: 'SAVE ₹250',
  },
];

// ─── Coupons ──────────────────────────────────────────────────────────────────

export interface Coupon {
  code: string;
  title: string;
  detail: string;
  /** Flat rupees off, applied when `minSubtotal` is met. */
  discount: number;
  minSubtotal: number;
}

export const COUPONS: Coupon[] = [
  {
    code: 'KAARYO150',
    title: 'Flat ₹150 off',
    detail: 'On your first booking above ₹499',
    discount: 150,
    minSubtotal: 499,
  },
  {
    code: 'CLEAN75',
    title: 'Flat ₹75 off',
    detail: 'On any booking above ₹349',
    discount: 75,
    minSubtotal: 349,
  },
  {
    code: 'BIGSAVE300',
    title: 'Flat ₹300 off',
    detail: 'On deep cleaning above ₹1,999',
    discount: 300,
    minSubtotal: 1999,
  },
];

// ─── Marketing content ────────────────────────────────────────────────────────

export interface TrustStat {
  value: string;
  label: string;
  icon: MdiName;
}

export const TRUST_STATS: TrustStat[] = [
  { value: '12L+', label: 'Families served', icon: 'account-group-outline' },
  { value: '4.8', label: 'Average rating', icon: 'star-outline' },
  { value: '10 min', label: 'Average arrival', icon: 'timer-outline' },
  { value: '100%', label: 'ID verified', icon: 'shield-check-outline' },
];

export interface ServicePromise {
  title: string;
  detail: string;
  icon: MdiName;
}

export const PROMISES: ServicePromise[] = [
  {
    title: 'Background verified',
    detail: 'Aadhaar and PAN checked before an expert is onboarded',
    icon: 'shield-check-outline',
  },
  {
    title: 'Fully equipped',
    detail: 'Experts bring their own tools and cleaning supplies',
    icon: 'toolbox-outline',
  },
  {
    title: 'No hidden charges',
    detail: 'The price you see at checkout is the price you pay',
    icon: 'cash-check',
  },
  {
    title: '2-day trained',
    detail: 'Every expert clears a hands-on training programme',
    icon: 'certificate-outline',
  },
];

export interface Review {
  name: string;
  locality: string;
  rating: number;
  quote: string;
}

export const REVIEWS: Review[] = [
  {
    name: 'Ananya R.',
    locality: 'Sector 55, Gurugram',
    rating: 5,
    quote:
      'Booked at 9 AM and the expert was at my door in eleven minutes. Kitchen looked brand new.',
  },
  {
    name: 'Vikram S.',
    locality: 'Powai, Mumbai',
    rating: 5,
    quote:
      'I stack mopping and utensils every evening. Same price every time, no surprises at the end.',
  },
  {
    name: 'Meera K.',
    locality: 'Indiranagar, Bengaluru',
    rating: 5,
    quote:
      'The deep clean crew brought their own machines. Bathroom grout finally looks white again.',
  },
];

/** Localities offered in the address picker, grouped by city. */
export const CITIES: { city: string; localities: string[] }[] = [
  {
    city: 'Gurugram',
    localities: ['Sector 55', 'Sector 56', 'DLF Phase 4', 'Golf Course Road', 'Sohna Road'],
  },
  {
    city: 'Bengaluru',
    localities: ['Indiranagar', 'Koramangala', 'Whitefield', 'HSR Layout', 'Bellandur'],
  },
  {
    city: 'Mumbai',
    localities: ['Powai', 'Andheri West', 'Bandra West', 'Lower Parel', 'Thane West'],
  },
  { city: 'Delhi', localities: ['Saket', 'Vasant Kunj', 'Dwarka', 'Rohini'] },
  { city: 'Pune', localities: ['Kharadi', 'Baner', 'Viman Nagar', 'Hinjewadi'] },
  { city: 'Hyderabad', localities: ['Gachibowli', 'Kondapur', 'Banjara Hills', 'Madhapur'] },
];

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function getServiceByKey(key: string | undefined): Service | undefined {
  if (!key) return undefined;
  return SERVICES.find((s) => s.key === key);
}

export function getServicesByGroup(group: ServiceGroupKey): Service[] {
  return SERVICES.filter((s) => s.group === group);
}

export function getBundleByKey(key: string | undefined): Bundle | undefined {
  if (!key) return undefined;
  return BUNDLES.find((b) => b.key === key);
}

export function getGroup(key: ServiceGroupKey): ServiceGroup {
  // Every ServiceGroupKey has an entry in SERVICE_GROUPS, so this cannot miss.
  return SERVICE_GROUPS.find((g) => g.key === key)!;
}

/** Popular tasks, used for the home "Most booked" rail. */
export function getPopularServices(): Service[] {
  return SERVICES.filter((s) => s.popular);
}

/**
 * The tickable tasks shown in the instant booking sheet.
 *
 * These are *not* the backend's subcategories — that list is fetched live and
 * validated server-side. These are the concrete household tasks behind this
 * app's finer-grained catalog, and they go into the job description, which the
 * worker reads verbatim. Without them a booking for "Ironing" would reach the
 * worker as nothing but the category it bills under.
 *
 * Falls back to `includes` so the sheet is never empty for a service with no
 * curated list — those lines already describe the work, they just read as a
 * promise rather than a choice.
 */
export function getSubcategories(service: Service): string[] {
  return service.subcategories ?? service.includes;
}

/**
 * Local service → the backend category it is booked and priced under.
 *
 * This app's catalog is deliberately finer-grained than the backend's rate card:
 * it sells "Sweeping & mopping" and "Fridge cleaning" where the server bills a
 * flat `cleaning`. Instant dispatch has to speak the server's language, so every
 * instant-bookable service needs an entry here — a service missing from this
 * table cannot be dispatched and falls back to the scheduled flow.
 *
 * Kept as one table rather than a field on each service so the whole mapping can
 * be read, and audited against `GET /api/services`, in one place.
 */
const REMOTE_CATEGORY: Record<string, RemoteCategoryKey> = {
  // Housekeeping and machine-assisted cleaning all bill at the `cleaning` rate.
  sweeping: 'cleaning',
  sweeping_mopping: 'cleaning',
  dusting: 'cleaning',
  bathroom: 'cleaning',
  utensils: 'cleaning',
  laundry: 'cleaning',
  ironing: 'cleaning',
  kitchen: 'cleaning',
  window: 'cleaning',
  staircase: 'cleaning',
  fridge: 'cleaning',
  organising: 'cleaning',
  deep_home: 'cleaning',
  sofa_carpet: 'cleaning',
  fan_cleaning: 'cleaning',
  bathroom_deep: 'cleaning',
  mattress: 'cleaning',
  water_tank: 'cleaning',

  cooking: 'cooking',

  electrical: 'electrical',
  plumbing: 'plumbing',
  carpentry: 'carpentry',
  ac_repair: 'ac_repair',
  painting: 'painting',
  pest_control: 'pest_control',
  // Odd jobs are dispatched to a carpenter — they carry the tool kit.
  handyman: 'carpentry',

  // `pet_care` is deliberately absent: the backend has no category for it, and
  // billing a dog walk as "Cleaning" would quote the wrong price for the wrong
  // job. It stays on the scheduled flow until the rate card grows a category.
};

export function getRemoteCategory(service: Service): RemoteCategoryKey | undefined {
  return REMOTE_CATEGORY[service.key];
}

/** `formatPrice(1499)` → `"₹1,499"` (Indian grouping). */
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** `formatMinutes(90)` → `"1 hr 30 min"`. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}
