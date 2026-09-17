/**
 * Dog and cat breed seed (§5, §6).
 *
 * Launch is dog and cat only (§1) — this file is the whole extent of it, and
 * deliberately does not claim completeness (§5, §6 both say so explicitly).
 * `typicalSize` and `coatType` are pre-fills the pricing engine's size
 * multiplier and breed-complexity factor read from — never the pet's own
 * `size`, which the owner sets and can correct (§7).
 *
 * `groomingComplexity` is what makes a full groom on a double-coated Husky
 * cost more than one on a short-coated Beagle — researched as roughly
 * proportional to documented grooming-time differences between coat types.
 */

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Species-prefixed, always — "Mixed Breed" and "Other Dog"/"Other Cat" are
 * names both species legitimately use, and a code collision between a dog
 * breed and a cat breed silently drops whichever seeds second (`code` is
 * unique). `dog_mixed_breed` and `cat_mixed_breed` cannot collide.
 */
function B(name, species, typicalSize, coatType, groomingComplexity = 1, isPopular = false) {
  return { code: `${species}_${slug(name)}`, name, species, typicalSize, coatType, groomingComplexity, isPopular };
}

const DOG_BREEDS = [
  B('Labrador Retriever', 'dog', 'large', 'short', 1, true),
  B('Golden Retriever', 'dog', 'large', 'double', 1.6, true),
  B('German Shepherd', 'dog', 'large', 'double', 1.5, true),
  B('Pomeranian', 'dog', 'small', 'double', 1.5, true),
  B('Shih Tzu', 'dog', 'small', 'long', 1.8, true),
  B('Beagle', 'dog', 'medium', 'short', 1),
  B('Pug', 'dog', 'small', 'short', 0.9, true),
  B('Rottweiler', 'dog', 'large', 'short', 1.1),
  B('Doberman', 'dog', 'large', 'short', 1),
  B('Dachshund', 'dog', 'small', 'short', 1),
  B('Cocker Spaniel', 'dog', 'medium', 'long', 1.6),
  B('French Bulldog', 'dog', 'small', 'short', 0.9),
  B('Husky', 'dog', 'large', 'double', 1.7, true),
  B('Great Dane', 'dog', 'extra_large', 'short', 1.2),
  B('Boxer', 'dog', 'large', 'short', 1),
  B('Lhasa Apso', 'dog', 'small', 'long', 1.8),
  B('Chihuahua', 'dog', 'small', 'short', 0.9, true),
  B('Maltese', 'dog', 'small', 'long', 1.7),
  B('Poodle', 'dog', 'medium', 'curly', 1.9, true),
  B('Corgi', 'dog', 'medium', 'double', 1.4),
  B('Cane Corso', 'dog', 'extra_large', 'short', 1.1),
  B('Indie / Indian Pariah', 'dog', 'medium', 'short', 0.9, true),
  B('Boston Terrier', 'dog', 'small', 'short', 0.9),
  B('Saint Bernard', 'dog', 'extra_large', 'double', 1.7),
  B('Rajapalayam', 'dog', 'large', 'short', 1),
  B('Mudhol Hound', 'dog', 'large', 'short', 1),
  B('Bull Terrier', 'dog', 'medium', 'short', 0.9),
  B('Shar Pei', 'dog', 'medium', 'short', 1),
  B('Bernese Mountain Dog', 'dog', 'extra_large', 'double', 1.8),
  B('Border Collie', 'dog', 'medium', 'double', 1.4),
  B('Rottweiler Mix', 'dog', 'large', 'short', 1.1),
  B('Bull Mastiff', 'dog', 'extra_large', 'short', 1.1),
  B('Papillon', 'dog', 'small', 'long', 1.5),
  B('Basset Hound', 'dog', 'medium', 'short', 1),
  B('Akita', 'dog', 'large', 'double', 1.6),
  B('Mixed Breed', 'dog', 'medium', 'unknown', 1, true),
  B('Other Dog', 'dog', 'medium', 'unknown', 1),
];

const CAT_BREEDS = [
  B('Indian Domestic Shorthair', 'cat', 'medium', 'short', 1, true),
  B('Persian', 'cat', 'medium', 'long', 1.8, true),
  B('Siamese', 'cat', 'medium', 'short', 1, true),
  B('Maine Coon', 'cat', 'large', 'long', 1.7),
  B('British Shorthair', 'cat', 'medium', 'short', 1),
  B('Bengal', 'cat', 'medium', 'short', 1),
  B('Ragdoll', 'cat', 'large', 'long', 1.6),
  B('Himalayan', 'cat', 'medium', 'long', 1.8),
  B('Scottish Fold', 'cat', 'medium', 'short', 1),
  B('Mixed Breed', 'cat', 'medium', 'unknown', 1, true),
  B('Other Cat', 'cat', 'medium', 'unknown', 1),
];

module.exports = { DOG_BREEDS, CAT_BREEDS, ALL_BREEDS: [...DOG_BREEDS, ...CAT_BREEDS] };
