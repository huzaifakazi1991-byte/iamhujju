export type GalleryItem = {
  file: string;
  title: string;
  why: string;
  madeWith: string;
};

export type GalleryFolder = {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  items: GalleryItem[];
};

export const GALLERY_FOLDERS: GalleryFolder[] = [
  {
    id: 'passport',
    label: 'Passport & IDs',
    icon: '🪪',
    blurb: 'Studio-grade ID photos, composed by a prompt.',
    items: [
      {
        file: 'passport-headshot.jpg',
        title: 'Passport size — for the passport',
        why: 'A clean, compliant passport-style headshot: plain background, even light, neutral expression — produced for an official passport application without a studio visit.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — one prompt, 3 refinements',
      },
      {
        file: 'id-portrait.jpg',
        title: 'Formal portrait for documents',
        why: 'A formal vertical portrait kept ready for ID cards, forms and professional verifications — the kind of photo you usually pay a photographer for.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — background swap + retouch in prompt',
      },
    ],
  },
  {
    id: 'posters',
    label: 'Posters & Reels',
    icon: '🎬',
    blurb: 'Cinematic frames that scroll-stopping reels are made of.',
    items: [
      {
        file: 'car-jump-poster.jpg',
        title: 'Car jump — poster to reel',
        why: 'From a poster idea to a reel thumbnail: a cinematic mid-air Ford truck with dust and drama, composed as a vertical hero frame for video intros and social posts.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — cinematography directed by text',
      },
    ],
  },
  {
    id: 'characters',
    label: 'Character Sheets',
    icon: '🎭',
    blurb: 'Consistent characters across poses, angles and outfits.',
    items: [
      {
        file: 'character-sheet.jpg',
        title: 'Multi-pose character sheet',
        why: 'A full character sheet — the same subject across poses, angles and framing — so the identity stays consistent in every future generation, like a VFX reference board.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — identity locked across poses',
      },
    ],
  },
  {
    id: 'brand',
    label: 'Brand & Web',
    icon: '🖥️',
    blurb: 'VFX polish and website-ready visuals, generated on demand.',
    items: [
      {
        file: 'brand-portrait.jpg',
        title: 'Brand portrait — VFX designer & web designer work',
        why: 'A professional brand portrait with shallow-depth-of-field polish, generated for the website, decks and profiles — shot quality from a text description, working like a VFX + web design pass.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — lighting & depth defocused by prompt',
      },
    ],
  },
];

export const GALLERY_INTRO =
  'Every frame in this gallery was created with LLM image models — the same Gemini-class intelligence you can use in the playground. A prompt described it, the model composed it, and the craft lived in the words.';
