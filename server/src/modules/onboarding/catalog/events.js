// Events & Celebrations, the must-haves in depth: more decoration themes and five new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const extend = {
  event_decoration: [
    job('naming', 'Naming ceremony decoration', 180, 4999, 'Cradle decoration|Name board|Backdrop and balloons'),
    job('festival', 'Festival home decoration (Diwali, Ganesh, Christmas)', 180, 3999, 'Theme backdrop|Lights and flowers|Set-up and take-down'),
    job('car', 'Wedding car decoration', 90, 2999, 'Fresh or artificial flowers|Ribbons|Front and bonnet'),
    job('haldi', 'Haldi or mehndi function decoration', 240, 9999, 'Marigold backdrop|Seating area|Props'),
    job('balloon_arch', 'Balloon arch and backdrop only', 120, 2499, 'Arch of your colours|Backdrop|Set-up'),
    job('room_surprise', 'Room surprise decoration with balloons and lights', 90, 1999, 'Balloons on ceiling|Fairy lights|Rose petals'),
    job('office_event', 'Office celebration decoration', 180, 6999, 'Theme of your choice|Entrance and stage|Set-up and take-down'),
  ],
};

const lines = [
  { code: 'flower_decor', prefix: 'flower', name: 'Flower decoration', domainCode: 'events', icon: 'Flower2', thing: 'event', types: ONE, isPopular: true,
    packages: [
      job('pooja', 'Pooja room or mandap flower decoration', 120, 2999, 'Fresh marigold and roses|Torans|Set-up'),
      job('entrance', 'Entrance and door flower torans', 90, 1999, 'Fresh flowers|Door and gate|Rangoli option'),
      job('stage', 'Stage flower decoration', 240, 14999, 'Backdrop with flowers|Stage edges|Set-up and take-down'),
      job('car', 'Car flower decoration', 90, 2999, 'Fresh flowers|Front and bonnet|Ribbons'),
      job('bed', 'First-night bed decoration', 90, 3499, 'Roses and jasmine|Candles|Petal art'),
      job('garlands', 'Garlands and bouquets, set of 10', 60, 1999, 'Fresh flowers|Delivered on time|Your colours'),
    ] },
  { code: 'tent_furniture', prefix: 'tent', name: 'Tent, shamiana & furniture rental', domainCode: 'events', icon: 'Home', thing: 'event', types: ONE,
    packages: [
      job('shamiana', 'Shamiana tent, up to 50 guests', 240, 7999, 'Tent and side walls|Floor carpet|Set-up and removal'),
      job('chairs', 'Chairs and tables, 50 guests', 120, 2999, 'Covered chairs|Round tables|Delivery and pickup'),
      job('stage', 'Stage platform, 16 x 8 ft', 240, 5999, 'Platform and carpet|Steps|Set-up and removal'),
      job('sofa_set', 'Stage sofa set for couple', 60, 2499, 'Royal sofa|Cushions|Delivery and pickup'),
      job('cooler_fans', 'Air coolers and fans, set of 4', 60, 1999, 'Delivery and set-up|Extension boards|Pickup'),
      job('generator', 'Generator, 15 kVA for 6 hours', 360, 6999, 'Generator and operator|Diesel included|Cables'),
    ] },
  { code: 'dj_sound', prefix: 'djsound', name: 'DJ, sound & lighting', domainCode: 'events', icon: 'Music', thing: 'event', types: ONE, isPopular: true,
    packages: [
      job('dj_4h', 'DJ with sound, 4 hours', 240, 9999, 'DJ and console|Speakers for 100 guests|Your playlist'),
      job('sound_only', 'Speaker and mic set, 4 hours', 240, 3999, 'Two speakers|Two mics|Operator'),
      job('lights', 'Party lights and fog, 4 hours', 240, 4999, 'Moving heads and LEDs|Fog machine|Operator'),
      job('dance_floor', 'LED dance floor, 12 x 12 ft', 240, 14999, 'LED floor|Set-up|Removal'),
      job('projector', 'Projector and screen, 4 hours', 240, 2999, 'Projector and screen|Laptop connection|Operator'),
      job('fairy_lights', 'Fairy lights for home or terrace', 120, 1999, 'Warm or colour lights|Set-up|Take-down'),
    ] },
  { code: 'entertainers', prefix: 'entertn', name: 'Anchors, magicians & kids entertainers', domainCode: 'events', icon: 'PartyPopper', thing: 'event', types: ONE,
    packages: [
      job('anchor', 'Anchor or emcee, 3 hours', 180, 7999, 'Script planned with you|Games and announcements|Hindi, Telugu or English'),
      job('magician', 'Magic show, 1 hour', 60, 4999, 'Kids or adults show|Audience participation|Props brought'),
      job('kids_games', 'Kids games host, 2 hours', 120, 3999, 'Games and prizes plan|Music|Up to 25 kids'),
      job('tattoo_face', 'Face painting and glitter tattoos, 2 hours', 120, 2999, 'Skin-safe paints|Many designs|Up to 30 kids'),
      job('puppet', 'Puppet show, 45 minutes', 45, 3499, 'Story show|Music|Props brought'),
      job('mascot', 'Cartoon mascot, 2 hours', 120, 2999, 'Character of your choice|Photos with guests|Dance'),
    ] },
  { code: 'event_staff', prefix: 'evstaff', name: 'Waiters, helpers & event staff', domainCode: 'events', icon: 'Users', thing: 'event', types: ONE,
    packages: [
      job('waiters_4', '4 waiters for 4 hours', 240, 3999, 'Uniformed waiters|Serving and clearing|Trained staff'),
      job('helpers_4', '4 helpers for set-up and clean-up, 4 hours', 240, 2999, 'Set-up chairs and tables|Clean-up after|Garbage bagged'),
      job('bouncer', 'Security guard or bouncer, 6 hours', 360, 2499, 'Trained guard|Entry management|Uniform'),
      job('valet', 'Valet parking, 2 drivers for 4 hours', 240, 3999, 'Licensed drivers|Token system|Parking managed'),
      job('reception', 'Welcome and reception staff, 2 for 4 hours', 240, 2999, 'Guest welcome|Gifts and registry|Well-dressed staff'),
      job('dishwash', 'Dishwashing staff for an event, 4 hours', 240, 1999, 'Two staff|Utensils washed|Area cleaned'),
    ] },
];

module.exports = { extend, lines };
