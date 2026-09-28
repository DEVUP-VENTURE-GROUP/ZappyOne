const EventCategory = require('./event-category.model');
const logger = require('../../core/logger');

const DEFAULT_CATEGORIES = [
  { slug: 'birthday',      name: 'Birthday',           emoji: '🎂', sortOrder: 1, description: 'Make their special day unforgettable with stunning birthday setups' },
  { slug: 'baby-shower',   name: 'Baby Shower',         emoji: '👶', sortOrder: 2, description: 'Welcome the little one with beautiful and dreamy decorations' },
  { slug: 'anniversary',   name: 'Anniversary',         emoji: '💑', sortOrder: 3, description: 'Celebrate your love story with romantic and elegant decor' },
  { slug: 'housewarming',  name: 'Housewarming',        emoji: '🏡', sortOrder: 4, description: 'Bless your new home with warm and festive decorations' },
  { slug: 'romantic',      name: 'Romantic Decoration', emoji: '❤️', sortOrder: 5, description: 'Set the perfect romantic mood for a surprise or date night' },
  { slug: 'welcome-baby',  name: 'Welcome Baby',        emoji: '🍼', sortOrder: 6, description: 'Celebrate the arrival of your newest family member' },
  { slug: 'engagement',    name: 'Engagement',          emoji: '💍', sortOrder: 7, description: 'Celebrate the promise of forever with spectacular decor' },
  { slug: 'graduation',    name: 'Graduation',          emoji: '🎓', sortOrder: 8, description: 'Honor their achievement with proud and vibrant decorations' },
  { slug: 'farewell',      name: 'Farewell',            emoji: '👋', sortOrder: 9, description: 'Give them a send-off to remember with heartfelt decorations' },
  { slug: 'kids-party',    name: 'Kids Party',          emoji: '🎈', sortOrder: 10, description: 'Create magical moments for the little ones' },
  { slug: 'gender-reveal', name: 'Gender Reveal',       emoji: '🎀', sortOrder: 11, description: 'Make the big reveal extra special and memorable' },
  { slug: 'corporate',     name: 'Corporate Event',     emoji: '🏢', sortOrder: 12, description: 'Professional and polished setups for business occasions' },
];

async function seedEventCategories() {
  try {
    const existing = await EventCategory.countDocuments();
    if (existing >= DEFAULT_CATEGORIES.length) return;

    for (const cat of DEFAULT_CATEGORIES) {
      await EventCategory.findOneAndUpdate(
        { slug: cat.slug },
        { $setOnInsert: cat },
        { upsert: true }
      );
    }
    logger.info({ count: DEFAULT_CATEGORIES.length }, '[SEED] Event categories seeded');
  } catch (err) {
    logger.warn({ err: err.message }, '[SEED] Event category seed failed — non-fatal');
  }
}

module.exports = { seedEventCategories };
