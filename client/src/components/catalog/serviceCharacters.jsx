/**
 * Zappy service characters.
 * ----------------------------------------------------------------------------
 * One original illustration per LIVE service, keyed by the catalog's own
 * `service.code`. The catalog stays the source of truth for name, description,
 * coverage and availability; this file only answers "what does it look like".
 *
 * ── WHY THESE ARE VECTOR, NOT 3D RENDERS ───────────────────────────────────
 * The intended artwork is a 3D rendered character per service. That has to be
 * produced by an image pipeline; these hand-authored SVGs are the interim, so
 * the catalog stops rendering fourteen near-identical glyphs while the renders
 * are made. They are original, a few hundred bytes each, scale losslessly from
 * a 48px chip to a hero, and add no network request or third-party dependency.
 *
 * ── SWAPPING IN THE RENDERS ────────────────────────────────────────────────
 * Drop a file into `public/assets/service-characters/` using the filename in
 * the manifest below — they derive deterministically from the service code —
 * then add that code to RENDERED below. That service switches to the render;
 * every other one keeps its vector until its own file lands.
 *
 * PER SERVICE, not one global switch. The renders arrive a few at a time, and
 * a single all-or-nothing flag would mean flipping it after the first batch
 * pointed the other eleven services at files that do not exist — eleven 404s
 * and eleven torn images on every page load, which is the exact failure this
 * system exists to prevent.
 *
 * It is an explicit list rather than a per-file existence check for the same
 * reason: the browser cannot ask "is this file there?" without requesting it,
 * and a request for a missing file IS the 404. Naming what exists costs one
 * line per asset and keeps the network clean.
 *
 * ── THE SHARED VISUAL FAMILY ───────────────────────────────────────────────
 * Every character is drawn on the same 120×120 square, front-facing, centred,
 * occupying roughly 70–85% of the canvas, standing on the same soft contact
 * shadow, lit from the upper left. What differs is the figure's pose and the
 * prop it holds — never the framing — so a rail of them reads as one family
 * and each still says what its service is.
 * ----------------------------------------------------------------------------
 */

import { useState } from 'react';

/**
 * Service codes whose rendered asset is actually on disk.
 *
 * Add a code here ONLY once its file is in public/assets/service-characters/.
 * A code listed without its file is a 404 and a torn image; a file present
 * without its code just keeps rendering the vector, which is harmless. So when
 * in doubt, land the file first and add the code second.
 *
 *   RENDERED = new Set(['mobile_repair', 'laptop_repair']);
 */
export const RENDERED = new Set([
  // (empty — every service is on its vector character)
]);

/* ── Shared palette ────────────────────────────────────────────────────────
   Skin and hair stay natural; the UNIFORM carries the domain colour, so the
   characters read as people doing a job rather than as tinted mascots. */
const SKIN = '#F2C4A0';
const SKIN_SHADE = '#DFA87F';
const HAIR = '#3B3355';
const SHADOW = 'rgba(15,23,42,0.10)';

/** The ground shadow every character stands on. */
function Ground() {
  return <ellipse cx="60" cy="108" rx="30" ry="5" fill={SHADOW} />;
}

/** Head + shoulders, shared by every human character. `tone` is the uniform. */
function Figure({ tone, toneDark }) {
  return (
    <>
      {/* torso */}
      <path d="M36 104V80a24 24 0 0 1 48 0v24z" fill={tone} />
      <path d="M60 56a24 24 0 0 1 24 24v24h-8V80a16 16 0 0 0-16-16z" fill={toneDark} opacity="0.55" />
      {/* neck */}
      <rect x="54" y="48" width="12" height="12" rx="5" fill={SKIN_SHADE} />
      {/* head */}
      <circle cx="60" cy="36" r="17" fill={SKIN} />
      {/* hair */}
      <path d="M43 34a17 17 0 0 1 34 0c0-9-7-13-17-13s-17 4-17 13z" fill={HAIR} />
      {/* eyes + smile */}
      <circle cx="53" cy="37" r="1.8" fill={HAIR} />
      <circle cx="67" cy="37" r="1.8" fill={HAIR} />
      <path d="M55 43a6 6 0 0 0 10 0" stroke={HAIR} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  );
}

/* ── The characters ───────────────────────────────────────────────────────
   Each is a `Figure` plus one prop that names the service. */

const Mobile = () => (
  <>
    <Ground />
    <Figure tone="#6366F1" toneDark="#4338CA" />
    {/* phone held up, screwdriver at the edge */}
    <rect x="76" y="58" width="20" height="32" rx="4" fill="#1E293B" />
    <rect x="79" y="62" width="14" height="22" rx="2" fill="#A5B4FC" />
    <rect x="24" y="66" width="18" height="4" rx="2" fill="#94A3B8" transform="rotate(-25 33 68)" />
    <rect x="20" y="66" width="7" height="4" rx="1.5" fill="#F59E0B" transform="rotate(-25 23 68)" />
  </>
);

const Laptop = () => (
  <>
    <Ground />
    <Figure tone="#6366F1" toneDark="#4338CA" />
    {/* open laptop in front */}
    <path d="M32 100l6-22h44l6 22z" fill="#CBD5E1" />
    <rect x="40" y="66" width="40" height="26" rx="3" fill="#1E293B" />
    <rect x="43" y="69" width="34" height="20" rx="2" fill="#A5B4FC" />
    <rect x="30" y="98" width="60" height="5" rx="2.5" fill="#94A3B8" />
  </>
);

const TwoWheeler = () => (
  <>
    <Ground />
    <Figure tone="#0EA5E9" toneDark="#0369A1" />
    {/* helmet over the head + wrench */}
    <path d="M43 34a17 17 0 0 1 34 0v4H43z" fill="#0369A1" />
    <rect x="43" y="34" width="34" height="5" rx="2.5" fill="#38BDF8" />
    <circle cx="26" cy="86" r="11" fill="none" stroke="#334155" strokeWidth="4" />
    <rect x="86" y="62" width="5" height="22" rx="2.5" fill="#94A3B8" transform="rotate(20 88 73)" />
    <circle cx="93" cy="60" r="5" fill="none" stroke="#94A3B8" strokeWidth="3" />
  </>
);

const FourWheeler = () => (
  <>
    <Ground />
    <Figure tone="#0EA5E9" toneDark="#0369A1" />
    {/* car silhouette beside the technician */}
    <path d="M14 96v-9l5-8h26l6 8h3v9z" fill="#334155" />
    <path d="M21 82h20l4 6H19z" fill="#7DD3FC" />
    <circle cx="24" cy="96" r="5" fill="#0F172A" />
    <circle cx="45" cy="96" r="5" fill="#0F172A" />
    {/* diagnostic reader */}
    <rect x="84" y="64" width="16" height="22" rx="3" fill="#1E293B" />
    <rect x="87" y="67" width="10" height="9" rx="1.5" fill="#4ADE80" />
  </>
);

const WaterTank = () => (
  <>
    <Ground />
    <Figure tone="#06B6D4" toneDark="#0E7490" />
    {/* hard hat */}
    <path d="M42 33a18 18 0 0 1 36 0v3H42z" fill="#FACC15" />
    <rect x="40" y="33" width="40" height="4" rx="2" fill="#EAB308" />
    {/* tank + hose */}
    <rect x="12" y="62" width="30" height="34" rx="6" fill="#67E8F9" />
    <rect x="12" y="62" width="30" height="8" rx="4" fill="#22D3EE" />
    <path d="M42 80c10 0 8 12 18 12" stroke="#0E7490" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <circle cx="94" cy="72" r="4" fill="#A5F3FC" />
    <circle cx="100" cy="82" r="3" fill="#A5F3FC" />
  </>
);

const ShoppingPickup = () => (
  <>
    <Ground />
    <Figure tone="#F59E0B" toneDark="#B45309" />
    {/* two shopping bags */}
    <path d="M16 74h26l-3 26H19z" fill="#FCD34D" />
    <path d="M23 74v-4a6 6 0 0 1 12 0v4" stroke="#B45309" strokeWidth="2.5" fill="none" />
    <path d="M82 78h22l-3 22H85z" fill="#FDE68A" />
    <path d="M88 78v-3a5 5 0 0 1 10 0v3" stroke="#B45309" strokeWidth="2.5" fill="none" />
  </>
);

const ReturnsExchange = () => (
  <>
    <Ground />
    <Figure tone="#F59E0B" toneDark="#B45309" />
    {/* parcel with a return arrow looping round it */}
    <rect x="76" y="66" width="30" height="28" rx="4" fill="#FCD34D" />
    <rect x="88" y="66" width="6" height="28" fill="#F59E0B" />
    <rect x="76" y="76" width="30" height="6" fill="#F59E0B" />
    <path d="M24 72a16 16 0 1 0 6 12" stroke="#B45309" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M18 66l7 7-9 3z" fill="#B45309" />
  </>
);

const PetGrooming = () => (
  <>
    <Ground />
    <Figure tone="#D946EF" toneDark="#A21CAF" />
    {/* freshly groomed dog + brush */}
    <ellipse cx="28" cy="88" rx="17" ry="13" fill="#FDE68A" />
    <circle cx="16" cy="78" r="10" fill="#FCD34D" />
    <ellipse cx="9" cy="71" rx="3.5" ry="5" fill="#F59E0B" />
    <circle cx="13" cy="77" r="1.6" fill="#3B3355" />
    <rect x="86" y="64" width="16" height="9" rx="3" fill="#F0ABFC" />
    <path d="M88 73v4M92 73v4M96 73v4M100 73v4" stroke="#A21CAF" strokeWidth="2" strokeLinecap="round" />
    {/* sparkle */}
    <path d="M44 62l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#F0ABFC" />
  </>
);

const PetBoarding = () => (
  <>
    <Ground />
    <Figure tone="#D946EF" toneDark="#A21CAF" />
    {/* kennel house with a happy pet inside */}
    <path d="M10 98V76l18-14 18 14v22z" fill="#F0ABFC" />
    <path d="M10 76l18-14 18 14z" fill="#D946EF" />
    <path d="M20 98V84a8 8 0 0 1 16 0v14z" fill="#FDF4FF" />
    <circle cx="28" cy="88" r="5" fill="#FCD34D" />
    <circle cx="26" cy="87" r="1.4" fill="#3B3355" />
    <circle cx="30" cy="87" r="1.4" fill="#3B3355" />
  </>
);

const PetWalk = () => (
  <>
    <Ground />
    <Figure tone="#D946EF" toneDark="#A21CAF" />
    {/* dog on a lead, mid-walk */}
    <ellipse cx="94" cy="90" rx="15" ry="11" fill="#FDE68A" />
    <circle cx="105" cy="81" r="9" fill="#FCD34D" />
    <ellipse cx="111" cy="75" rx="3" ry="4.5" fill="#F59E0B" />
    <circle cx="108" cy="80" r="1.5" fill="#3B3355" />
    <path d="M82 92v8M90 99v6M100 99v6" stroke="#F59E0B" strokeWidth="3.5" strokeLinecap="round" />
    {/* lead */}
    <path d="M78 70c8 4 10 10 16 12" stroke="#A21CAF" strokeWidth="3" fill="none" strokeLinecap="round" />
  </>
);

const PetHomeCare = () => (
  <>
    <Ground />
    <Figure tone="#D946EF" toneDark="#A21CAF" />
    {/* home outline + food bowl */}
    <path d="M8 96V78l16-12 16 12v18z" fill="none" stroke="#D946EF" strokeWidth="4" strokeLinejoin="round" />
    <path d="M16 96v-9h16v9z" fill="#F0ABFC" />
    <path d="M84 96a11 11 0 0 1 22 0z" fill="#FCD34D" />
    <ellipse cx="95" cy="85" rx="9" ry="4" fill="#F59E0B" />
  </>
);

const PetTransport = () => (
  <>
    <Ground />
    <Figure tone="#D946EF" toneDark="#A21CAF" />
    {/* carrier with a pet looking out */}
    <rect x="8" y="68" width="40" height="30" rx="7" fill="#F0ABFC" />
    <rect x="14" y="74" width="20" height="18" rx="4" fill="#FDF4FF" />
    <path d="M18 74v18M24 74v18M30 74v18" stroke="#D946EF" strokeWidth="2" />
    <circle cx="40" cy="83" r="5" fill="#FCD34D" />
    <path d="M18 68v-4a10 10 0 0 1 20 0v4" stroke="#A21CAF" strokeWidth="3" fill="none" />
  </>
);

const PetVetAssist = () => (
  <>
    <Ground />
    <Figure tone="#22C55E" toneDark="#15803D" />
    {/* stethoscope + pet */}
    <path d="M78 58v12a12 12 0 0 0 24 0V58" stroke="#15803D" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <circle cx="102" cy="76" r="6" fill="#86EFAC" stroke="#15803D" strokeWidth="2.5" />
    <ellipse cx="26" cy="90" rx="15" ry="11" fill="#FDE68A" />
    <circle cx="15" cy="81" r="9" fill="#FCD34D" />
    <circle cx="12" cy="80" r="1.5" fill="#3B3355" />
    {/* cross */}
    <path d="M40 60h10M45 55v10" stroke="#22C55E" strokeWidth="4" strokeLinecap="round" />
  </>
);

const PetCheck = () => (
  <>
    <Ground />
    <Figure tone="#22C55E" toneDark="#15803D" />
    {/* clipboard with a tick + pet */}
    <rect x="78" y="58" width="28" height="36" rx="4" fill="#DCFCE7" stroke="#15803D" strokeWidth="2.5" />
    <rect x="86" y="54" width="12" height="7" rx="2.5" fill="#15803D" />
    <path d="M85 76l6 6 12-13" stroke="#22C55E" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="26" cy="92" rx="14" ry="10" fill="#FDE68A" />
    <circle cx="16" cy="84" r="8" fill="#FCD34D" />
    <circle cx="13" cy="83" r="1.4" fill="#3B3355" />
  </>
);

/**
 * code → { file, title, concept, Art }
 *
 * `file` is the filename the rendered asset must use; it is derived from the
 * service code (underscores to hyphens) so the mapping stays mechanical.
 * `concept` is the art direction for whoever renders it — kept beside the
 * drawing so the two cannot drift apart.
 */
export const SERVICE_CHARACTERS = {
  mobile_repair: {
    file: 'mobile-repair.webp', title: 'Phone technician', Art: Mobile,
    concept: 'Technician holding a smartphone in one hand and a precision screwdriver in the other.',
  },
  laptop_repair: {
    file: 'laptop-repair.webp', title: 'Laptop technician', Art: Laptop,
    concept: 'Technician behind an open laptop on a bench, precision tools at hand.',
  },
  two_wheeler: {
    file: 'two-wheeler.webp', title: 'Two-wheeler mechanic', Art: TwoWheeler,
    concept: 'Mechanic in a helmet holding a spanner, motorcycle wheel beside them.',
  },
  four_wheeler: {
    file: 'four-wheeler.webp', title: 'Car technician', Art: FourWheeler,
    concept: 'Car technician with a handheld diagnostic reader, compact car behind.',
  },
  water_tank_care: {
    file: 'water-tank-care.webp', title: 'Tank cleaning specialist', Art: WaterTank,
    concept: 'Worker in a hard hat with a hose, water tank beside them, droplets.',
  },
  shopping_pickup: {
    file: 'shopping-pickup.webp', title: 'Shopper', Art: ShoppingPickup,
    concept: 'Friendly shopper carrying two reusable bags of groceries.',
  },
  returns_exchange: {
    file: 'returns-exchange.webp', title: 'Returns assistant', Art: ReturnsExchange,
    concept: 'Assistant holding a parcel with a looping return arrow around it.',
  },
  pet_grooming: {
    file: 'pet-grooming.webp', title: 'Pet groomer', Art: PetGrooming,
    concept: 'Groomer with a brush beside a freshly groomed, sparkling dog.',
  },
  pet_boarding: {
    file: 'pet-boarding.webp', title: 'Boarding carer', Art: PetBoarding,
    concept: 'Carer beside a cosy kennel with a contented pet inside.',
  },
  pet_walk: {
    file: 'pet-walk.webp', title: 'Dog walker', Art: PetWalk,
    concept: 'Cheerful walker mid-stride with a dog on a lead.',
  },
  pet_home_care: {
    file: 'pet-home-care.webp', title: 'Home pet carer', Art: PetHomeCare,
    concept: 'Carer visiting a home, feeding bowl in view.',
  },
  pet_transport: {
    file: 'pet-transport.webp', title: 'Pet transport', Art: PetTransport,
    concept: 'Handler carrying a pet carrier with an animal looking out.',
  },
  pet_vet_assist: {
    file: 'pet-vet-assist.webp', title: 'Vet assistant', Art: PetVetAssist,
    concept: 'Veterinary professional with a stethoscope beside a calm pet.',
  },
  pet_check: {
    file: 'pet-check.webp', title: 'Pet health check', Art: PetCheck,
    concept: 'Carer with a clipboard and a ticked checklist beside a pet.',
  },
};

/** Where the rendered assets live once they exist. */
export const CHARACTER_DIR = '/assets/service-characters';

/**
 * The one entry point. Returns what to draw for a service code, or null when
 * the code has no character — the caller then keeps its existing icon
 * treatment, so an unmapped service degrades instead of rendering nothing.
 */
export function characterFor(code) {
  const entry = SERVICE_CHARACTERS[code];
  if (!entry) return null;
  return {
    ...entry,
    // Only services named in RENDERED get a URL; the rest return null and the
    // caller draws the vector, so nothing is ever requested that is not there.
    src: RENDERED.has(code) ? `${CHARACTER_DIR}/${entry.file}` : null,
  };
}

/** Draws a character: the rendered asset when ready, else the vector original. */
export function ServiceCharacter({ code, size = 56, className = '' }) {
  // Last-resort net: a code listed in RENDERED whose file did not actually
  // ship. Rather than hide the image and leave an empty chip, fall back to the
  // vector — the customer sees a character either way.
  const [rasterFailed, setRasterFailed] = useState(false);

  const character = characterFor(code);
  if (!character) return null;

  const { src, Art, title } = character;

  if (src && !rasterFailed) {
    return (
      <img
        src={src}
        alt={title}
        width={size}
        height={size}
        loading="lazy"
        className={className}
        onError={() => setRasterFailed(true)}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <Art />
    </svg>
  );
}
