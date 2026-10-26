// Programmatic SEO data: every state and union territory with its main cities, and the services ZappyOne really sells. A city is live only when listed in LIVE or marked live in admin (City.live).

const LIVE = new Set(['hyderabad']);

const AREAS = {
  hyderabad: ['Madhapur', 'Gachibowli', 'Kondapur', 'HiTech City', 'Jubilee Hills', 'Banjara Hills', 'Kukatpally', 'Secunderabad', 'LB Nagar', 'Dilsukhnagar', 'Ameerpet', 'Begumpet', 'Narsingi', 'Manikonda', 'Miyapur', 'Kompally'],
  bengaluru: ['Koramangala', 'Indiranagar', 'Whitefield', 'Electronic City', 'JP Nagar', 'HSR Layout', 'Jayanagar', 'Marathahalli', 'Hebbal', 'Yelahanka'],
  mumbai: ['Andheri', 'Bandra', 'Powai', 'Borivali', 'Malad', 'Goregaon', 'Kandivali', 'Mulund', 'Ghatkopar', 'Kurla'],
  delhi: ['Connaught Place', 'South Delhi', 'Dwarka', 'Rohini', 'Lajpat Nagar', 'Saket', 'Janakpuri', 'Preet Vihar'],
  chennai: ['Anna Nagar', 'T Nagar', 'Adyar', 'Velachery', 'Tambaram', 'OMR', 'Guindy', 'Porur'],
  pune: ['Koregaon Park', 'Baner', 'Hinjewadi', 'Wakad', 'Kothrud', 'Hadapsar', 'Viman Nagar', 'Aundh'],
};

const STATES = [
  ['Andhra Pradesh', [['Visakhapatnam', 17.6868, 83.2185], ['Vijayawada', 16.5062, 80.648], ['Amaravati', 16.5131, 80.5165], ['Guntur', 16.3067, 80.4365], ['Tirupati', 13.6288, 79.4192], ['Nellore', 14.4426, 79.9865], ['Kurnool', 15.8281, 78.0373], ['Rajahmundry', 17.0005, 81.804], ['Kakinada', 16.9891, 82.2475], ['Anantapur', 14.6819, 77.6006]]],
  ['Arunachal Pradesh', [['Itanagar', 27.0844, 93.6053]]],
  ['Assam', [['Guwahati', 26.1445, 91.7362], ['Dibrugarh', 27.4728, 94.912], ['Silchar', 24.8333, 92.7789], ['Jorhat', 26.7509, 94.2037]]],
  ['Bihar', [['Patna', 25.5941, 85.1376], ['Gaya', 24.7914, 85.0002], ['Muzaffarpur', 26.1209, 85.3647], ['Bhagalpur', 25.2425, 86.9842]]],
  ['Chhattisgarh', [['Raipur', 21.2514, 81.6296], ['Bhilai', 21.1938, 81.3509], ['Bilaspur', 22.0797, 82.1409]]],
  ['Goa', [['Panaji', 15.4909, 73.8278], ['Margao', 15.2832, 73.9862], ['Vasco da Gama', 15.3982, 73.8113]]],
  ['Gujarat', [['Ahmedabad', 23.0225, 72.5714], ['Surat', 21.1702, 72.8311], ['Vadodara', 22.3072, 73.1812], ['Rajkot', 22.3039, 70.8022], ['Gandhinagar', 23.2156, 72.6369], ['Bhavnagar', 21.7645, 72.1519], ['Jamnagar', 22.4707, 70.0577]]],
  ['Haryana', [['Gurugram', 28.4595, 77.0266], ['Faridabad', 28.4089, 77.3178], ['Panipat', 29.3909, 76.9635], ['Ambala', 30.3782, 76.7767], ['Karnal', 29.6857, 76.9905], ['Hisar', 29.1492, 75.7217]]],
  ['Himachal Pradesh', [['Shimla', 31.1048, 77.1734], ['Dharamshala', 32.219, 76.3234], ['Manali', 32.2432, 77.1892]]],
  ['Jharkhand', [['Ranchi', 23.3441, 85.3096], ['Jamshedpur', 22.8046, 86.2029], ['Dhanbad', 23.7957, 86.4304], ['Bokaro', 23.6693, 86.1511]]],
  ['Karnataka', [['Bengaluru', 12.9716, 77.5946], ['Mysuru', 12.2958, 76.6394], ['Mangaluru', 12.9141, 74.856], ['Hubballi', 15.3647, 75.124], ['Belagavi', 15.8497, 74.4977], ['Kalaburagi', 17.3297, 76.8343]]],
  ['Kerala', [['Thiruvananthapuram', 8.5241, 76.9366], ['Kochi', 9.9312, 76.2673], ['Kozhikode', 11.2588, 75.7804], ['Thrissur', 10.5276, 76.2144], ['Kollam', 8.8932, 76.6141]]],
  ['Madhya Pradesh', [['Bhopal', 23.2599, 77.4126], ['Indore', 22.7196, 75.8577], ['Jabalpur', 23.1815, 79.9864], ['Gwalior', 26.2183, 78.1828], ['Ujjain', 23.1765, 75.7885]]],
  ['Maharashtra', [['Mumbai', 19.076, 72.8777], ['Pune', 18.5204, 73.8567], ['Nagpur', 21.1458, 79.0882], ['Thane', 19.2183, 72.9781], ['Nashik', 19.9975, 73.7898], ['Navi Mumbai', 19.033, 73.0297], ['Aurangabad', 19.8762, 75.3433], ['Solapur', 17.6599, 75.9064], ['Kolhapur', 16.705, 74.2433]]],
  ['Manipur', [['Imphal', 24.817, 93.9368]]],
  ['Meghalaya', [['Shillong', 25.5788, 91.8933]]],
  ['Mizoram', [['Aizawl', 23.7271, 92.7176]]],
  ['Nagaland', [['Kohima', 25.6751, 94.1086], ['Dimapur', 25.9091, 93.7266]]],
  ['Odisha', [['Bhubaneswar', 20.2961, 85.8245], ['Cuttack', 20.4625, 85.883], ['Rourkela', 22.2604, 84.8536], ['Puri', 19.8135, 85.8312]]],
  ['Punjab', [['Ludhiana', 30.901, 75.8573], ['Amritsar', 31.634, 74.8723], ['Jalandhar', 31.326, 75.5762], ['Patiala', 30.3398, 76.3869], ['Mohali', 30.7046, 76.7179]]],
  ['Rajasthan', [['Jaipur', 26.9124, 75.7873], ['Jodhpur', 26.2389, 73.0243], ['Udaipur', 24.5854, 73.7125], ['Kota', 25.2138, 75.8648], ['Ajmer', 26.4499, 74.6399], ['Bikaner', 28.0229, 73.3119]]],
  ['Sikkim', [['Gangtok', 27.3389, 88.6065]]],
  ['Tamil Nadu', [['Chennai', 13.0827, 80.2707], ['Coimbatore', 11.0168, 76.9558], ['Madurai', 9.9252, 78.1198], ['Tiruchirappalli', 10.7905, 78.7047], ['Salem', 11.6643, 78.146], ['Tirunelveli', 8.7139, 77.7567], ['Vellore', 12.9165, 79.1325]]],
  ['Telangana', [['Hyderabad', 17.385, 78.4867], ['Secunderabad', 17.4399, 78.4983], ['Warangal', 17.9689, 79.5941], ['Karimnagar', 18.4386, 79.1288], ['Nizamabad', 18.6725, 78.094], ['Khammam', 17.2473, 80.1514], ['Mahbubnagar', 16.7488, 77.9855], ['Nalgonda', 17.0575, 79.2671], ['Sangareddy', 17.6248, 78.0823], ['Siddipet', 18.1018, 78.852], ['Vikarabad', 17.3381, 77.9044]]],
  ['Tripura', [['Agartala', 23.8315, 91.2868]]],
  ['Uttar Pradesh', [['Lucknow', 26.8467, 80.9462], ['Kanpur', 26.4499, 80.3319], ['Noida', 28.5355, 77.391], ['Ghaziabad', 28.6692, 77.4538], ['Agra', 27.1767, 78.0081], ['Varanasi', 25.3176, 82.9739], ['Prayagraj', 25.4358, 81.8463], ['Meerut', 28.9845, 77.7064]]],
  ['Uttarakhand', [['Dehradun', 30.3165, 78.0322], ['Haridwar', 29.9457, 78.1642], ['Rishikesh', 30.0869, 78.2676]]],
  ['West Bengal', [['Kolkata', 22.5726, 88.3639], ['Howrah', 22.5958, 88.2636], ['Durgapur', 23.5204, 87.3119], ['Siliguri', 26.7271, 88.3953], ['Asansol', 23.6739, 86.9524]]],
  ['Andaman and Nicobar Islands', [['Port Blair', 11.6234, 92.7265]]],
  ['Chandigarh', [['Chandigarh', 30.7333, 76.7794]]],
  ['Dadra and Nagar Haveli and Daman and Diu', [['Daman', 20.3974, 72.8328], ['Silvassa', 20.2766, 73.0169]]],
  ['Delhi', [['Delhi', 28.6139, 77.209], ['New Delhi', 28.6139, 77.2088]]],
  ['Jammu and Kashmir', [['Srinagar', 34.0837, 74.7973], ['Jammu', 32.7266, 74.857]]],
  ['Ladakh', [['Leh', 34.1526, 77.5771]]],
  ['Lakshadweep', [['Kavaratti', 10.5593, 72.6358]]],
  ['Puducherry', [['Puducherry', 11.9416, 79.8083]]],
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const CITIES = STATES.flatMap(([state, cities]) => cities.map(([name, lat, lng]) => {
  const slug = slugify(name);
  return {
    slug, name, state, stateSlug: slugify(state), lat, lng, live: LIVE.has(slug),
    areas: (AREAS[slug] || []).map((a) => ({ slug: slugify(a), name: a })),
  };
}));

// What ZappyOne really sells, each opening its real booking screen.
const CATEGORIES = [
  { slug: 'bike-wash', name: 'Bike wash at home', short: 'Bike wash', spaPath: '/repair/bike-wash', what: 'Foam wash, chain clean and lube, polish or a quick waterless wipe for scooters and bikes at your parking.' },
  { slug: 'car-wash', name: 'Car wash at home', short: 'Car wash', spaPath: '/repair/car-wash', what: 'Foam wash, inside vacuum, interior deep clean with seat shampoo, or full detailing for hatchbacks, sedans and SUVs at your parking.' },
  { slug: 'phone-repair', name: 'Phone repair at home', short: 'Phone repair', spaPath: '/repair', what: 'Screen, battery, charging and more, diagnosed at your door before you are quoted.' },
  { slug: 'laptop-repair', name: 'Laptop repair at home', short: 'Laptop repair', spaPath: '/repair/laptop', what: 'Screen, keyboard, battery, slow laptop and upgrades, diagnosed before you are quoted.' },
  { slug: 'grocery-shopping-help', name: 'Grocery run', short: 'Grocery run', spaPath: '/helping/shopping?mode=grocery_run', what: 'We shop from your list, deliver and unpack. The bill is paid at actual cost.' },
  { slug: 'doctor-visit-escort', name: 'Doctor visit escort for elders', short: 'Doctor visit escort', spaPath: '/helping/shopping?mode=doctor_escort', what: 'We go along to the clinic or hospital, wait, and bring them back home.' },
  { slug: 'elder-care-visits', name: 'Elder daily check-in', short: 'Elder check-in', spaPath: '/helping/shopping?mode=elder_checkin', what: 'A visit, medicine reminder, small chores and an update to the family.' },
  { slug: 'party-helper', name: 'Party helper', short: 'Party helper', spaPath: '/helping/shopping?mode=party_helper', what: 'Serving, clearing and cleaning during your home function.' },
  { slug: 'puja-festival-help', name: 'Puja and festival help', short: 'Puja help', spaPath: '/helping/shopping?mode=puja_help', what: 'Set-up, flowers and clean-up for your puja or festival.' },
  { slug: 'pet-grooming', name: 'Pet grooming and care', short: 'Pet grooming', spaPath: '/pet', what: 'Bath, haircut, hygiene and care for your dog or cat.' },
  { slug: 'event-decoration', name: 'Event and party decoration', short: 'Event decoration', spaPath: '/events', what: 'Birthday, anniversary and festive decoration at home or a venue.' },
];

const CITY_MAP = Object.fromEntries(CITIES.map((c) => [c.slug, c]));
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
const STATE_LIST = STATES.map(([state]) => ({ name: state, slug: slugify(state) }));

module.exports = { CITIES, CATEGORIES, CITY_MAP, CATEGORY_MAP, STATE_LIST, slugify };
