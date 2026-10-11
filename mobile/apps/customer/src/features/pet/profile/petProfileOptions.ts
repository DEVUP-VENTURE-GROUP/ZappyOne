/**
 * What a provider must know before handling the animal (the website's
 * MyPetsPage, server pet.routes SAFETY). Launch is dog and cat only; size is
 * the customer's answer, never silently inferred from breed.
 */
export interface Option { value: string | number; label: string }

export const SPECIES: Option[] = [{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }];
export const SIZES: Option[] = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }, { value: 'extra_large', label: 'Extra Large' }];
export const GENDERS: Option[] = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }];
export const AGES: Option[] = [
  { value: 0.25, label: 'Under 6 months' }, { value: 0.75, label: '6–12 months' },
  ...Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: `${i + 1} year${i ? 's' : ''}` })),
];
export const TEMPERAMENTS: Option[] = [
  { value: 'calm', label: 'Calm' }, { value: 'friendly', label: 'Friendly' }, { value: 'energetic', label: 'Energetic' },
  { value: 'anxious', label: 'Nervous' }, { value: 'aggressive', label: 'Aggressive' },
];
export const VACCINATION: Option[] = [{ value: 'up_to_date', label: 'Up to date' }, { value: 'partial', label: 'Some done' }, { value: 'not_vaccinated', label: 'Not vaccinated' }, { value: 'unknown', label: 'Not sure' }];
export const BITE: Option[] = [{ value: 'none', label: 'Never' }, { value: 'medium', label: 'Once or twice' }, { value: 'high', label: 'Yes, may bite' }];
export const STRANGERS: Option[] = [{ value: 'none', label: 'Friendly' }, { value: 'low', label: 'Shy or wary' }, { value: 'high', label: 'Can get aggressive' }];

/** Answers a booking needs; the rest of the profile is optional. */
export const REQUIRED = ['size', 'gender', 'age', 'weight', 'temperament', 'vaccinationStatus', 'biteRisk', 'aggressionLevel'] as const;

/** The nearest age choice for a birth date. */
export function ageOf(dob?: string): number | '' {
  if (!dob) return '';
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 86400e3);
  return (AGES.reduce((best, a) => (Math.abs(Number(a.value) - years) < Math.abs(Number(best.value) - years) ? a : best)).value as number);
}
