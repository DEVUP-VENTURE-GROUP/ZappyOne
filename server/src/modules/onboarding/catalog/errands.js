// Errands, Shopping & Pickup, what family help does not already cover: more laundry and document jobs and four new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const extend = {
  laundry_pickup: [
    job('saree_roll', 'Saree roll press, per saree', 20, 99, 'Pickup and drop|Roll press|Folded in a cover'),
    job('blanket', 'Blanket or quilt dry clean', 30, 449, 'Pickup and drop|Dry clean|Packed'),
    job('curtains_dc', 'Curtains dry clean, per panel', 30, 199, 'Pickup and drop|Dry clean|Folded'),
    job('suit_dc', 'Suit or blazer dry clean', 20, 349, 'Pickup and drop|Dry clean and press|On a hanger'),
    job('express', 'Express laundry, same day', 30, 199, 'Added to any order|Back the same evening|Pickup before 10 am'),
  ],
  document_delivery: [
    job('two_stops', 'Two pickups or drops in the city', 120, 349, 'Bike rider|Sealed envelope|Photo proof at each stop'),
    job('collect_sign', 'Collect signature and return', 120, 399, 'Document taken|Signed copy brought back|Photo proof'),
    job('urgent', 'Urgent delivery within 60 minutes', 60, 299, 'Nearest rider|Up to 10 km|Live updates'),
  ],
};

const lines = [
  { code: 'parcel_delivery', prefix: 'parcel', name: 'Local parcel pickup & delivery', domainCode: 'errands_pickup', icon: 'Package', thing: 'parcel', types: ONE, isPopular: true,
    packages: [
      job('small_5', 'Small parcel up to 5 km', 45, 99, 'Bike rider|Up to 5 kg|Photo proof'),
      job('small_15', 'Small parcel up to 15 km', 75, 179, 'Bike rider|Up to 5 kg|Photo proof'),
      job('medium', 'Medium parcel up to 15 km', 90, 299, 'Bike rider|Up to 15 kg|Photo proof'),
      job('tiffin', 'Tiffin or lunch box delivery', 45, 99, 'Picked hot|Delivered on time|Box returned option'),
      job('forgot', 'Forgot something at home, bring it to me', 60, 149, 'Pick from your home|Deliver to you|Within 10 km'),
      job('multi', 'Up to 4 stops in one trip', 150, 449, 'Bike rider|Route planned|Photo proof at each stop'),
    ] },
  { code: 'gift_delivery', prefix: 'giftdel', name: 'Gift, cake & flower delivery', domainCode: 'errands_pickup', icon: 'ShoppingBag', thing: 'delivery', types: ONE,
    packages: [
      job('cake', 'Pick up a cake and deliver', 60, 149, 'Kept upright and cool|On time|Photo at handover'),
      job('flowers', 'Pick up flowers and deliver', 60, 149, 'Fresh handling|On time|Photo at handover'),
      job('gift', 'Pick up a gift and deliver', 60, 149, 'Wrapped as given|On time|Photo at handover'),
      job('midnight', 'Midnight surprise delivery', 60, 399, 'Between 11:30 pm and 12:30 am|Doorstep surprise|Photo and video'),
      job('buy_deliver', 'Buy a gift for me and deliver (gift cost extra)', 120, 299, 'Shop of your choice|Bill shared|Delivered'),
      job('hamper', 'Festival hampers to 5 addresses', 240, 799, 'Five drops in the city|Route planned|Photo proof'),
    ] },
  { code: 'shoe_bag_repair', prefix: 'cobbler', name: 'Shoe & bag repair with pickup', domainCode: 'errands_pickup', icon: 'Footprints', thing: 'item', types: ONE,
    packages: [
      job('sole', 'Shoe sole repair or replace', 30, 349, 'Pickup and drop|Sole glued or stitched|Polished'),
      job('stitch', 'Shoe stitching', 20, 199, 'Pickup and drop|Strong thread|Polished'),
      job('heel', 'Heel fix or replace', 20, 249, 'Pickup and drop|Heel tip or block|Polished'),
      job('shoe_clean', 'Sneaker deep clean', 30, 399, 'Pickup and drop|Deep clean and whiten|Laces washed'),
      job('bag_zip', 'Bag zip or strap repair', 30, 299, 'Pickup and drop|Zip or strap replaced|Tested'),
      job('suitcase', 'Suitcase wheel or handle repair', 30, 499, 'Pickup and drop|Wheel or handle replaced|Tested'),
    ] },
  { code: 'key_duplicate', prefix: 'keydup', name: 'Duplicate keys & lock help', domainCode: 'errands_pickup', icon: 'KeyRound', thing: 'key', types: ONE,
    packages: [
      job('door_key', 'Door key duplicate, per key', 15, 99, 'Pickup and drop or at home|Cut to match|Tested'),
      job('bike_key', 'Bike or scooter key duplicate', 30, 299, 'Cut to match|Tested in the lock|Spare key'),
      job('car_key', 'Car key duplicate (non-chip)', 45, 699, 'Cut to match|Tested|Spare key'),
      job('locked_out', 'Locked out, door opening help', 45, 499, 'Locksmith visit|Door opened without damage where possible|ID checked'),
      job('almirah', 'Almirah or drawer key making', 30, 249, 'Key made at home|Lock checked|Spare key'),
      job('handover', 'Key handover to a guest or tenant', 45, 149, 'Pick from you|Hand over with ID check|Photo proof'),
    ] },
];

module.exports = { extend, lines };
