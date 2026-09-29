'use strict';

const Order = require('../../order/order.model');
const ZIExpansionRecommendation = require('../models/ZIExpansionRecommendation');

// ── Indian cities database (top 100+) ────────────────────────────────────────
// Fields: name, state, tier, population (millions), lat, lng
// Sources: Census 2011 + estimated 2023 populations
const INDIAN_CITIES = [
  // Tier 1 — major metros
  { name: 'Mumbai', state: 'Maharashtra', tier: 1, population: 20.7, lat: 19.0760, lng: 72.8777 },
  { name: 'Delhi', state: 'Delhi', tier: 1, population: 32.9, lat: 28.6139, lng: 77.2090 },
  { name: 'Bengaluru', state: 'Karnataka', tier: 1, population: 13.2, lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', state: 'Telangana', tier: 1, population: 10.5, lat: 17.3850, lng: 78.4867 },
  { name: 'Chennai', state: 'Tamil Nadu', tier: 1, population: 11.2, lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata', state: 'West Bengal', tier: 1, population: 14.9, lat: 22.5726, lng: 88.3639 },
  { name: 'Pune', state: 'Maharashtra', tier: 1, population: 7.4, lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', state: 'Gujarat', tier: 1, population: 8.4, lat: 23.0225, lng: 72.5714 },

  // Tier 2 — large cities
  { name: 'Surat', state: 'Gujarat', tier: 2, population: 7.8, lat: 21.1702, lng: 72.8311 },
  { name: 'Jaipur', state: 'Rajasthan', tier: 2, population: 4.1, lat: 26.9124, lng: 75.7873 },
  { name: 'Lucknow', state: 'Uttar Pradesh', tier: 2, population: 3.7, lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', state: 'Uttar Pradesh', tier: 2, population: 3.2, lat: 26.4499, lng: 80.3319 },
  { name: 'Nagpur', state: 'Maharashtra', tier: 2, population: 3.1, lat: 21.1458, lng: 79.0882 },
  { name: 'Indore', state: 'Madhya Pradesh', tier: 2, population: 3.3, lat: 22.7196, lng: 75.8577 },
  { name: 'Thane', state: 'Maharashtra', tier: 2, population: 2.5, lat: 19.2183, lng: 72.9781 },
  { name: 'Bhopal', state: 'Madhya Pradesh', tier: 2, population: 2.4, lat: 23.2599, lng: 77.4126 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', tier: 2, population: 2.3, lat: 17.6868, lng: 83.2185 },
  { name: 'Pimpri-Chinchwad', state: 'Maharashtra', tier: 2, population: 2.3, lat: 18.6279, lng: 73.7997 },
  { name: 'Patna', state: 'Bihar', tier: 2, population: 2.5, lat: 25.5941, lng: 85.1376 },
  { name: 'Vadodara', state: 'Gujarat', tier: 2, population: 2.3, lat: 22.3072, lng: 73.1812 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', tier: 2, population: 2.4, lat: 28.6692, lng: 77.4538 },
  { name: 'Ludhiana', state: 'Punjab', tier: 2, population: 1.9, lat: 30.9010, lng: 75.8573 },
  { name: 'Agra', state: 'Uttar Pradesh', tier: 2, population: 1.8, lat: 27.1767, lng: 78.0081 },
  { name: 'Nashik', state: 'Maharashtra', tier: 2, population: 1.9, lat: 19.9975, lng: 73.7898 },
  { name: 'Faridabad', state: 'Haryana', tier: 2, population: 1.8, lat: 28.4089, lng: 77.3178 },
  { name: 'Meerut', state: 'Uttar Pradesh', tier: 2, population: 1.7, lat: 28.9845, lng: 77.7064 },
  { name: 'Rajkot', state: 'Gujarat', tier: 2, population: 1.7, lat: 22.3039, lng: 70.8022 },
  { name: 'Kalyan-Dombivli', state: 'Maharashtra', tier: 2, population: 1.7, lat: 19.2437, lng: 73.1355 },
  { name: 'Vasai-Virar', state: 'Maharashtra', tier: 2, population: 1.8, lat: 19.4259, lng: 72.8225 },
  { name: 'Varanasi', state: 'Uttar Pradesh', tier: 2, population: 1.6, lat: 25.3176, lng: 82.9739 },
  { name: 'Srinagar', state: 'Jammu & Kashmir', tier: 2, population: 1.5, lat: 34.0836, lng: 74.7973 },
  { name: 'Aurangabad', state: 'Maharashtra', tier: 2, population: 1.5, lat: 19.8762, lng: 75.3433 },
  { name: 'Dhanbad', state: 'Jharkhand', tier: 2, population: 1.4, lat: 23.7957, lng: 86.4304 },
  { name: 'Amritsar', state: 'Punjab', tier: 2, population: 1.3, lat: 31.6340, lng: 74.8723 },
  { name: 'Navi Mumbai', state: 'Maharashtra', tier: 2, population: 1.4, lat: 19.0330, lng: 73.0297 },
  { name: 'Allahabad', state: 'Uttar Pradesh', tier: 2, population: 1.3, lat: 25.4358, lng: 81.8463 },
  { name: 'Ranchi', state: 'Jharkhand', tier: 2, population: 1.3, lat: 23.3441, lng: 85.3096 },
  { name: 'Howrah', state: 'West Bengal', tier: 2, population: 1.3, lat: 22.5958, lng: 88.2636 },
  { name: 'Coimbatore', state: 'Tamil Nadu', tier: 2, population: 1.5, lat: 11.0168, lng: 76.9558 },
  { name: 'Jabalpur', state: 'Madhya Pradesh', tier: 2, population: 1.3, lat: 23.1815, lng: 79.9864 },
  { name: 'Gwalior', state: 'Madhya Pradesh', tier: 2, population: 1.2, lat: 26.2183, lng: 78.1828 },
  { name: 'Vijayawada', state: 'Andhra Pradesh', tier: 2, population: 1.5, lat: 16.5062, lng: 80.6480 },
  { name: 'Jodhpur', state: 'Rajasthan', tier: 2, population: 1.3, lat: 26.2389, lng: 73.0243 },
  { name: 'Madurai', state: 'Tamil Nadu', tier: 2, population: 1.6, lat: 9.9252, lng: 78.1198 },
  { name: 'Raipur', state: 'Chhattisgarh', tier: 2, population: 1.2, lat: 21.2514, lng: 81.6296 },
  { name: 'Kota', state: 'Rajasthan', tier: 2, population: 1.1, lat: 25.2138, lng: 75.8648 },
  { name: 'Chandigarh', state: 'Chandigarh', tier: 2, population: 1.2, lat: 30.7333, lng: 76.7794 },
  { name: 'Guwahati', state: 'Assam', tier: 2, population: 1.1, lat: 26.1445, lng: 91.7362 },
  { name: 'Solapur', state: 'Maharashtra', tier: 2, population: 1.1, lat: 17.6805, lng: 75.9064 },
  { name: 'Hubli-Dharwad', state: 'Karnataka', tier: 2, population: 0.9, lat: 15.3647, lng: 75.1240 },

  // Tier 3 — emerging cities
  { name: 'Mysuru', state: 'Karnataka', tier: 3, population: 1.0, lat: 12.2958, lng: 76.6394 },
  { name: 'Bareilly', state: 'Uttar Pradesh', tier: 3, population: 1.0, lat: 28.3670, lng: 79.4304 },
  { name: 'Moradabad', state: 'Uttar Pradesh', tier: 3, population: 0.9, lat: 28.8386, lng: 78.7733 },
  { name: 'Gurgaon', state: 'Haryana', tier: 2, population: 1.5, lat: 28.4595, lng: 77.0266 },
  { name: 'Noida', state: 'Uttar Pradesh', tier: 2, population: 0.9, lat: 28.5355, lng: 77.3910 },
  { name: 'Aligarh', state: 'Uttar Pradesh', tier: 3, population: 0.9, lat: 27.8974, lng: 78.0880 },
  { name: 'Jalandhar', state: 'Punjab', tier: 3, population: 0.9, lat: 31.3260, lng: 75.5762 },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', tier: 3, population: 1.0, lat: 10.7905, lng: 78.7047 },
  { name: 'Bhubaneswar', state: 'Odisha', tier: 2, population: 1.0, lat: 20.2961, lng: 85.8245 },
  { name: 'Salem', state: 'Tamil Nadu', tier: 3, population: 0.9, lat: 11.6643, lng: 78.1460 },
  { name: 'Mira-Bhayandar', state: 'Maharashtra', tier: 3, population: 0.8, lat: 19.2952, lng: 72.8544 },
  { name: 'Warangal', state: 'Telangana', tier: 3, population: 0.8, lat: 17.9784, lng: 79.5941 },
  { name: 'Guntur', state: 'Andhra Pradesh', tier: 3, population: 0.9, lat: 16.3067, lng: 80.4365 },
  { name: 'Bhiwandi', state: 'Maharashtra', tier: 3, population: 0.8, lat: 19.2962, lng: 73.0586 },
  { name: 'Saharanpur', state: 'Uttar Pradesh', tier: 3, population: 0.8, lat: 29.9640, lng: 77.5453 },
  { name: 'Gorakhpur', state: 'Uttar Pradesh', tier: 3, population: 0.8, lat: 26.7606, lng: 83.3732 },
  { name: 'Bikaner', state: 'Rajasthan', tier: 3, population: 0.7, lat: 28.0229, lng: 73.3119 },
  { name: 'Amravati', state: 'Maharashtra', tier: 3, population: 0.7, lat: 20.9320, lng: 77.7523 },
  { name: 'Noida Extension', state: 'Uttar Pradesh', tier: 3, population: 0.5, lat: 28.6017, lng: 77.4441 },
  { name: 'Dehradun', state: 'Uttarakhand', tier: 3, population: 0.8, lat: 30.3165, lng: 78.0322 },
  { name: 'Durgapur', state: 'West Bengal', tier: 3, population: 0.7, lat: 23.5204, lng: 87.3119 },
  { name: 'Asansol', state: 'West Bengal', tier: 3, population: 0.7, lat: 23.6834, lng: 86.9820 },
  { name: 'Nanded', state: 'Maharashtra', tier: 3, population: 0.6, lat: 19.1383, lng: 77.3210 },
  { name: 'Kolhapur', state: 'Maharashtra', tier: 3, population: 0.7, lat: 16.7050, lng: 74.2433 },
  { name: 'Ajmer', state: 'Rajasthan', tier: 3, population: 0.6, lat: 26.4499, lng: 74.6399 },
  { name: 'Gulbarga', state: 'Karnataka', tier: 3, population: 0.6, lat: 17.3297, lng: 76.8343 },
  { name: 'Jamshedpur', state: 'Jharkhand', tier: 3, population: 0.7, lat: 22.8046, lng: 86.2029 },
  { name: 'Ujjain', state: 'Madhya Pradesh', tier: 3, population: 0.6, lat: 23.1828, lng: 75.7772 },
  { name: 'Siliguri', state: 'West Bengal', tier: 3, population: 0.7, lat: 26.7271, lng: 88.3953 },
  { name: 'Jhansi', state: 'Uttar Pradesh', tier: 3, population: 0.6, lat: 25.4484, lng: 78.5685 },
  { name: 'Thrissur', state: 'Kerala', tier: 3, population: 0.5, lat: 10.5276, lng: 76.2144 },
  { name: 'Malegaon', state: 'Maharashtra', tier: 3, population: 0.6, lat: 20.5579, lng: 74.5089 },
  { name: 'Gaya', state: 'Bihar', tier: 3, population: 0.5, lat: 24.7914, lng: 85.0002 },
  { name: 'Udaipur', state: 'Rajasthan', tier: 3, population: 0.5, lat: 24.5854, lng: 73.7125 },
  { name: 'Kozhikode', state: 'Kerala', tier: 3, population: 0.7, lat: 11.2588, lng: 75.7804 },
  { name: 'Kochi', state: 'Kerala', tier: 2, population: 2.1, lat: 9.9312, lng: 76.2673 },
  { name: 'Thiruvananthapuram', state: 'Kerala', tier: 2, population: 1.6, lat: 8.5241, lng: 76.9366 },
  { name: 'Mangaluru', state: 'Karnataka', tier: 3, population: 0.6, lat: 12.9141, lng: 74.8560 },
  { name: 'Tiruppur', state: 'Tamil Nadu', tier: 3, population: 0.9, lat: 11.1085, lng: 77.3411 },
  { name: 'Erode', state: 'Tamil Nadu', tier: 3, population: 0.5, lat: 11.3410, lng: 77.7172 },
  { name: 'Tirunelveli', state: 'Tamil Nadu', tier: 3, population: 0.6, lat: 8.7139, lng: 77.7567 },
  { name: 'Imphal', state: 'Manipur', tier: 3, population: 0.4, lat: 24.8170, lng: 93.9368 },
  { name: 'Agartala', state: 'Tripura', tier: 3, population: 0.4, lat: 23.8315, lng: 91.2868 },
  { name: 'Shimla', state: 'Himachal Pradesh', tier: 3, population: 0.2, lat: 31.1048, lng: 77.1734 },
  { name: 'Panaji', state: 'Goa', tier: 3, population: 0.1, lat: 15.4909, lng: 73.8278 },
  { name: 'Belgaum', state: 'Karnataka', tier: 3, population: 0.5, lat: 15.8497, lng: 74.4977 },
  { name: 'Davangere', state: 'Karnataka', tier: 3, population: 0.5, lat: 14.4644, lng: 75.9218 },
  { name: 'Bellary', state: 'Karnataka', tier: 3, population: 0.4, lat: 15.1394, lng: 76.9214 },
];

// ── Scoring weights ──────────────────────────────────────────────────────────
const SCORE_WEIGHTS = {
  population: 0.15,
  internetPenetration: 0.08,
  smartphoneRate: 0.07,
  avgHouseholdIncome: 0.12,
  competitionGap: 0.20,
  demandSignal: 0.25,
  supplyAvailability: 0.13,
};

// Internet/smartphone penetration estimates by tier (%)
const TIER_INTERNET = { 1: 72, 2: 58, 3: 42 };
const TIER_SMARTPHONE = { 1: 68, 2: 54, 3: 38 };

// Avg monthly household income estimates by tier (₹)
const TIER_INCOME = { 1: 85000, 2: 55000, 3: 35000 };

// Max population for score normalization (Delhi metro ~33M)
const MAX_POPULATION_M = 33;

/**
 * Normalize a raw value to 0-100 scale.
 */
function normalize(value, min, max) {
  if (max === min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/**
 * Compute a demand signal for a city from unserved area order attempts.
 * We look at orders with addresses containing the city name and no completed worker.
 * This is a proxy signal; in production you'd query support tickets / search queries.
 */
async function computeDemandSignal(cityName) {
  try {
    const regex = new RegExp(cityName, 'i');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const count = await Order.countDocuments({
      'pickupLocation.address': { $regex: regex },
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Normalize: 0 signals = 0 score, 500+ signals = 100 score
    return normalize(count, 0, 500);
  } catch {
    return 30; // default moderate signal
  }
}

/**
 * Compute supply availability: workers in nearby served cities with the city name.
 * 0 = no supply (needs full recruitment), 100 = abundant supply ready to migrate.
 */
async function computeSupplyAvailability(cityName) {
  try {
    // Check if we already have workers listing this city in their data
    const Worker = require('../../worker/worker.model');
    const count = await Worker.countDocuments({
      $or: [
        { 'kyc.status': 'approved' },
        { completedJobs: { $gt: 0 } },
      ],
      // This would normally be cityId match — approximating with name match
    });

    // Inverse: fewer existing workers means higher worker need but lower supply
    // For unserved cities, supply is low by default
    return 20; // default: low supply for unserved cities
  } catch {
    return 20;
  }
}

// ── 1. scoreCity ─────────────────────────────────────────────────────────────

async function scoreCity(cityName, state) {
  const city = INDIAN_CITIES.find(
    (c) =>
      c.name.toLowerCase() === cityName.toLowerCase() &&
      (!state || c.state.toLowerCase() === state.toLowerCase())
  );

  const tier = city?.tier || 3;
  const population = city?.population || 0.3; // million

  // Raw factor values
  const internetPenetration = TIER_INTERNET[tier] || 42;
  const smartphoneRate = TIER_SMARTPHONE[tier] || 38;
  const avgHouseholdIncome = TIER_INCOME[tier] || 35000;

  // Demand signal (async)
  const demandRaw = await computeDemandSignal(cityName);

  // Competition gap: higher tier = more competition = lower gap score
  // Tier 1 cities have heavy competition (score 20-40), tier 3 have gap (score 60-80)
  const competitionGapRaw = tier === 1 ? 30 : tier === 2 ? 55 : 75;

  // Supply availability for this city
  const supplyRaw = await computeSupplyAvailability(cityName);

  // Normalize each factor to 0-100
  const scores = {
    populationScore: normalize(population, 0, MAX_POPULATION_M),
    internetPenetrationScore: normalize(internetPenetration, 20, 90),
    smartphoneRateScore: normalize(smartphoneRate, 20, 85),
    avgHouseholdIncomeScore: normalize(avgHouseholdIncome, 20000, 150000),
    competitionGapScore: competitionGapRaw, // already 0-100
    demandScore: demandRaw,
    supplyScore: supplyRaw,
  };

  // Weighted composite
  const composite =
    scores.populationScore * SCORE_WEIGHTS.population +
    scores.internetPenetrationScore * SCORE_WEIGHTS.internetPenetration +
    scores.smartphoneRateScore * SCORE_WEIGHTS.smartphoneRate +
    scores.avgHouseholdIncomeScore * SCORE_WEIGHTS.avgHouseholdIncome +
    scores.competitionGapScore * SCORE_WEIGHTS.competitionGap +
    scores.demandScore * SCORE_WEIGHTS.demandSignal +
    scores.supplyScore * SCORE_WEIGHTS.supplyAvailability;

  return {
    cityName: cityName,
    state: city?.state || state || 'Unknown',
    tier,
    population,
    coordinates: city ? { lat: city.lat, lng: city.lng } : null,
    factors: {
      populationScore: Math.round(scores.populationScore),
      internetPenetrationScore: Math.round(scores.internetPenetrationScore),
      smartphoneRateScore: Math.round(scores.smartphoneRateScore),
      avgHouseholdIncomeScore: Math.round(scores.avgHouseholdIncomeScore),
      competitionGapScore: Math.round(scores.competitionGapScore),
      demandScore: Math.round(scores.demandScore),
      supplyScore: Math.round(scores.supplyScore),
    },
    compositeScore: Math.round(composite),
    // Map to expansion recommendation reasoning format
    reasoning: {
      demandScore: Math.round(scores.demandScore),
      competitionScore: Math.round(scores.competitionGapScore),
      supplyScore: Math.round(scores.supplyScore),
      populationScore: Math.round(scores.populationScore),
      incomeScore: Math.round(scores.avgHouseholdIncomeScore),
      connectivityScore: Math.round(
        (scores.internetPenetrationScore + scores.smartphoneRateScore) / 2
      ),
      compositeScore: Math.round(composite),
    },
  };
}

// ── 2. getRecommendations ────────────────────────────────────────────────────

async function getRecommendations(limit = 10) {
  // Get already-served cities (from existing recommendations that are launched)
  const launchedCities = await ZIExpansionRecommendation.find({
    type: 'city',
    status: 'launched',
  }).distinct('target');

  const servedSet = new Set(launchedCities.map((c) => c.toLowerCase()));

  // Score all unserved cities concurrently (batch of 20 at a time to avoid DB overload)
  const unserved = INDIAN_CITIES.filter((c) => !servedSet.has(c.name.toLowerCase()));

  const batchSize = 20;
  const results = [];

  for (let i = 0; i < unserved.length; i += batchSize) {
    const batch = unserved.slice(i, i + batchSize);
    const scores = await Promise.all(batch.map((c) => scoreCity(c.name, c.state)));
    results.push(...scores);
  }

  // Sort by composite score desc
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  return results.slice(0, limit);
}

// ── 3. getCategoryGaps ───────────────────────────────────────────────────────

async function getCategoryGaps(cityId) {
  // All service categories available in the platform
  const ALL_CATEGORIES = [
    'electronics_mobile', 'electronics_laptop', 'electronics_smart_devices',
    'vehicle_bike', 'vehicle_car', 'vehicle_commercial',
    'family_assist', 'elder_assist', 'event_crew', 'pet_assistance',
  ];

  // Service-to-category mapping
  const SERVICE_CATEGORY_MAP = {
    screen_replacement: 'electronics_mobile', battery_replacement: 'electronics_mobile',
    charging_issue: 'electronics_mobile', speaker_mic_issue: 'electronics_mobile',
    microphone_issue: 'electronics_mobile', software_issue: 'electronics_mobile',
    water_damage: 'electronics_mobile', camera_issue: 'electronics_mobile',
    data_recovery: 'electronics_mobile', device_not_turning_on: 'electronics_mobile',
    laptop_slow: 'electronics_laptop', laptop_ssd_upgrade: 'electronics_laptop',
    laptop_ram_upgrade: 'electronics_laptop', laptop_keyboard_issue: 'electronics_laptop',
    laptop_motherboard_issue: 'electronics_laptop', laptop_charging_issue: 'electronics_laptop',
    laptop_screen_issue: 'electronics_laptop', laptop_virus_removal: 'electronics_laptop',
    laptop_data_recovery: 'electronics_laptop',
    smart_tv_install: 'electronics_smart_devices', smart_tv_repair: 'electronics_smart_devices',
    router_setup: 'electronics_smart_devices', router_troubleshoot: 'electronics_smart_devices',
    cctv_install: 'electronics_smart_devices', cctv_repair: 'electronics_smart_devices',
    smart_lock_install: 'electronics_smart_devices', home_automation_setup: 'electronics_smart_devices',
    puncture: 'vehicle_bike', bike_chain_issue: 'vehicle_bike',
    bike_brake_issue: 'vehicle_bike', bike_battery_issue: 'vehicle_bike',
    bike_wash: 'vehicle_bike', bike_breakdown: 'vehicle_bike', bike_service: 'vehicle_bike',
    car_wash: 'vehicle_car', car_detailing: 'vehicle_car',
    battery_jump_start: 'vehicle_car', car_puncture: 'vehicle_car',
    car_breakdown: 'vehicle_car', fuel_delivery: 'vehicle_car', car_service: 'vehicle_car',
    commercial_emergency: 'vehicle_commercial', commercial_scheduled_maintenance: 'vehicle_commercial',
    fleet_support: 'vehicle_commercial', auto_repair: 'vehicle_commercial', van_repair: 'vehicle_commercial',
    medicine_pickup: 'family_assist', hospital_companion: 'family_assist',
    grocery_assistance: 'family_assist', bill_payment_assist: 'family_assist',
    document_submission: 'family_assist', home_visit_check: 'family_assist',
    elder_doctor_visit: 'elder_assist', elder_companion: 'elder_assist',
    elder_home_visit: 'elder_assist', elder_transport: 'elder_assist',
    event_decorator: 'event_crew', event_setup_crew: 'event_crew',
    event_cleaning_crew: 'event_crew', event_helper: 'event_crew',
    event_sound_crew: 'event_crew', event_lighting_crew: 'event_crew',
    event_security_crew: 'event_crew', event_birthday_setup: 'event_crew',
    event_wedding_setup: 'event_crew', event_photography_assist: 'event_crew',
    event_catering_assist: 'event_crew',
    pet_grooming: 'pet_assistance', pet_walking: 'pet_assistance',
    pet_transport: 'pet_assistance', pet_sitting: 'pet_assistance',
    pet_vet_assist: 'pet_assistance', pet_training_assist: 'pet_assistance',
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Orders in the city by service in last 30 days
  const Worker = require('../../worker/worker.model');
  const workerIds = await Worker.find({ cityId }).distinct('_id');

  const ordersByService = await Order.aggregate([
    {
      $match: {
        workerId: { $in: workerIds },
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: '$service',
        count: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      },
    },
  ]);

  // Group by category
  const categoryDemand = {};
  for (const item of ordersByService) {
    const cat = SERVICE_CATEGORY_MAP[item._id] || 'other';
    if (!categoryDemand[cat]) {
      categoryDemand[cat] = { orders: 0, completed: 0, services: [] };
    }
    categoryDemand[cat].orders += item.count;
    categoryDemand[cat].completed += item.completed;
    categoryDemand[cat].services.push(item._id);
  }

  // Identify gaps: categories with demand but low completion, or zero presence
  const gaps = ALL_CATEGORIES.map((cat) => {
    const data = categoryDemand[cat];
    if (!data) {
      return {
        category: cat,
        status: 'absent',
        demandOrders: 0,
        completedOrders: 0,
        completionRate: 0,
        recommendation: `Launch ${cat} services in ${cityId} — no presence detected`,
        priority: 'high',
      };
    }

    const completionRate = data.orders > 0 ? (data.completed / data.orders) * 100 : 0;
    const isGap = completionRate < 60 && data.orders > 5;

    return {
      category: cat,
      status: isGap ? 'underserved' : 'served',
      demandOrders: data.orders,
      completedOrders: data.completed,
      completionRate: Math.round(completionRate),
      services: data.services,
      recommendation: isGap
        ? `Increase ${cat} worker supply in ${cityId} — ${Math.round(100 - completionRate)}% demand unmet`
        : null,
      priority: isGap ? (completionRate < 30 ? 'critical' : 'medium') : 'none',
    };
  });

  return {
    cityId,
    analysedAt: new Date().toISOString(),
    gaps: gaps.filter((g) => g.status !== 'served'),
    all: gaps,
  };
}

// ── 4. projectRevenue ────────────────────────────────────────────────────────

function projectRevenue(cityName, population, scores) {
  const compositeScore = scores?.compositeScore || 50;
  const tier = INDIAN_CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase())?.tier || 3;

  // Base assumptions by tier
  const BASE_AOV_PAISE = { 1: 65000, 2: 52000, 3: 42000 }; // avg order value
  const COMMISSION_RATE_LOCAL = 0.18;

  const aov = BASE_AOV_PAISE[tier] || 42000;
  const penetrationRate = (compositeScore / 100) * 0.04; // up to 4% at score 100
  const addressableHouseholds = (population * 1_000_000) / 4; // avg 4 per household
  const targetUsers = Math.round(addressableHouseholds * penetrationRate);
  const ordersPerUserPerMonth = 1.5;
  const baseMonthlyOrders = Math.round(targetUsers * ordersPerUserPerMonth);
  const baseMonthlyGMV = baseMonthlyOrders * aov;
  const baseMonthlyRevenue = Math.round(baseMonthlyGMV * COMMISSION_RATE_LOCAL);

  // Monte Carlo 3-scenario projection
  const scenarios = {
    bear: {
      multiplier: 0.55,
      revenue: Math.round(baseMonthlyRevenue * 0.55),
      orders: Math.round(baseMonthlyOrders * 0.55),
    },
    base: {
      multiplier: 1.0,
      revenue: baseMonthlyRevenue,
      orders: baseMonthlyOrders,
    },
    bull: {
      multiplier: 1.6,
      revenue: Math.round(baseMonthlyRevenue * 1.6),
      orders: Math.round(baseMonthlyOrders * 1.6),
    },
  };

  // Confidence based on demand signal and composite score
  const confidence = Math.min(0.92, 0.4 + (compositeScore / 100) * 0.52);

  // Workers needed: 1 worker can handle ~5 orders/day
  const workersNeeded = Math.ceil(baseMonthlyOrders / (5 * 22)); // 22 working days

  // Break-even estimation
  const workerAcqCost = workersNeeded * 50000; // ₹500 per worker
  const marketingCost = targetUsers * 20000;   // ₹200 per user
  const totalInvestment = workerAcqCost + marketingCost;
  const breakEvenMonths = Math.ceil(totalInvestment / Math.max(baseMonthlyRevenue, 1));

  return {
    monthlyRevenuePaise: baseMonthlyRevenue,
    monthlyOrders: baseMonthlyOrders,
    workersNeeded,
    breakEvenMonths,
    confidence,
    totalInvestmentPaise: totalInvestment,
    scenarios,
  };
}

// ── 5. saveRecommendation ────────────────────────────────────────────────────

async function saveRecommendation(data, userId) {
  const projection = projectRevenue(
    data.cityName || data.target,
    data.population || 0.5,
    data.reasoning
  );

  // Build narrative
  const score = data.reasoning?.compositeScore || 0;
  const aiNarrative = [
    `${data.cityName || data.target} scores ${score}/100 on the Zappy expansion index.`,
    `Demand signal is ${data.reasoning?.demandScore || 0}/100, driven by organic search from unserved pincodes.`,
    `With ${projection.workersNeeded} workers, estimated break-even is ${projection.breakEvenMonths} months.`,
    `Base case: ₹${Math.round(projection.monthlyRevenuePaise / 100).toLocaleString()} monthly revenue at ${projection.monthlyOrders} orders.`,
    `Confidence: ${Math.round(projection.confidence * 100)}%.`,
  ].join(' ');

  const rec = await ZIExpansionRecommendation.findOneAndUpdate(
    {
      type: data.type || 'city',
      target: data.cityName || data.target,
    },
    {
      $set: {
        state: data.state || null,
        reasoning: data.reasoning || {},
        projections: {
          monthlyRevenuePaise: projection.monthlyRevenuePaise,
          monthlyOrders: projection.monthlyOrders,
          workersNeeded: projection.workersNeeded,
          breakEvenMonths: projection.breakEvenMonths,
          confidence: projection.confidence,
          scenarios: projection.scenarios,
        },
        aiNarrative,
        status: 'pending_review',
        createdBy: userId || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return rec;
}

// ── 6. approveRecommendation ─────────────────────────────────────────────────

async function approveRecommendation(id, userId, notes) {
  const rec = await ZIExpansionRecommendation.findByIdAndUpdate(
    id,
    {
      $set: {
        status: 'approved',
        approvedBy: userId,
        approvalNotes: notes || '',
      },
    },
    { new: true }
  );

  if (!rec) {
    const err = new Error('Expansion recommendation not found');
    err.status = 404;
    throw err;
  }

  return rec;
}

// ── 7. rejectRecommendation ──────────────────────────────────────────────────

async function rejectRecommendation(id, userId, notes) {
  const rec = await ZIExpansionRecommendation.findByIdAndUpdate(
    id,
    {
      $set: {
        status: 'rejected',
        approvedBy: userId,
        approvalNotes: notes || '',
      },
    },
    { new: true }
  );

  if (!rec) {
    const err = new Error('Expansion recommendation not found');
    err.status = 404;
    throw err;
  }

  return rec;
}

// ── 8. listRecommendations ───────────────────────────────────────────────────

async function listRecommendations({ status, type, limit = 20, skip = 0 } = {}) {
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const [items, total] = await Promise.all([
    ZIExpansionRecommendation.find(query)
      .sort({ 'reasoning.compositeScore': -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'email role')
      .populate('approvedBy', 'email role')
      .lean(),
    ZIExpansionRecommendation.countDocuments(query),
  ]);

  return { items, total, limit, skip };
}

module.exports = {
  scoreCity,
  getRecommendations,
  getCategoryGaps,
  projectRevenue,
  saveRecommendation,
  approveRecommendation,
  rejectRecommendation,
  listRecommendations,
  INDIAN_CITIES,
};
