export type GalleryItem = {
  file: string;
  title: string;
  why: string;
  madeWith: string;
  kind?: 'image' | 'video';
  poster?: string;
  template: string;
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
        template:
          'Using the person in the photo I attached, create a professional brand portrait: cinematic key light, shallow depth of field with a softly blurred studio backdrop, confident posture, business-appropriate styling, sharp focus on the eyes, premium website-hero quality. Keep the face 100% identical to my attached photo. Attach your own photo with the 📎 button, then send.',
      },
      {
        file: 'gallery-reel-demo.mp4',
        kind: 'video',
        poster: 'car-jump-poster.jpg',
        title: 'Poster to reel — motion demo',
        why: 'The gallery in motion: a poster frame turned into a vertical reel clip. AI image models create the still, video models bring it to life — the same pipeline behind scroll-stopping social reels.',
        madeWith: 'Gallery stills (Gemini · Nano Banana) composed into a vertical motion reel',
        template:
          'Turn the poster-style photo I attached into a vertical 9:16 reel frame: extend the scene beyond its edges with atmosphere — drifting dust particles, subtle motion streaks, dramatic lighting bloom — keeping my subject perfectly intact in the center. Cinematic, poster-quality, ready for an intro clip. Attach your own photo with the 📎 button, then send.',
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
        template:
          'Using the vehicle or subject in the photo I attached, recreate a cinematic poster: the subject frozen mid-jump in the air, dust and debris kicked up below, dramatic sky with god rays, motion blur on the wheels, high-contrast color grade, vertical 9:16 composition for a reel thumbnail. Keep my subject 100% recognizable. Attach your own photo with the 📎 button, then send.',
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
        template:
          'Using the person in the photo I attached, produce a multi-pose character sheet on one neutral light-grey board: the same character shown in turning front, three-quarter, side and back views, plus one action pose and one close-up headshot. Keep the face, hair and outfit 100% identical across every panel — a VFX-reference-style identity sheet. Attach your own photo with the 📎 button, then send.',
      },
    ],
  },
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
        template:
          'Using the face in the photo I attached, create a compliant passport-style headshot: plain white background, even soft studio lighting with no shadows, neutral relaxed expression, head and shoulders centered, eyes open, sharp focus, official passport composition in a vertical 3:4 crop. Keep my face 100% identical to the attached photo. Attach your own photo with the 📎 button, then send.',
      },
      {
        file: 'id-portrait.jpg',
        title: 'Formal portrait for documents',
        why: 'A formal vertical portrait kept ready for ID cards, forms and professional verifications — the kind of photo you usually pay a photographer for.',
        madeWith: 'LLM image model (Gemini · Nano Banana) — background swap + retouch in prompt',
        template:
          'Using the person in the photo I attached, create a formal document portrait: light neutral studio background, soft even lighting, subtle professional retouch, formal attire, gentle confident expression, vertical ID-card framing. Keep my face 100% identical to the attached photo. Attach your own photo with the 📎 button, then send.',
      },
    ],
  },
];

export const GALLERY_INTRO =
  'Every frame in this gallery was created with LLM image models — the same Gemini-class intelligence you can use in the playground. A prompt described it, the model composed it, and the craft lived in the words.';

export function galleryItemSlug(file: string): string {
  return file.replace(/\.(jpg|jpeg|png|webp|avif|mp4|webm|mov)$/i, '');
}

export function isGalleryVideo(item: Pick<GalleryItem, 'file' | 'kind'>): boolean {
  return item.kind === 'video' || /\.(mp4|webm|mov)$/i.test(item.file);
}

export function findGalleryTemplate(
  slug: string,
): { title: string; prompt: string } | undefined {
  for (const folder of GALLERY_FOLDERS) {
    for (const item of folder.items) {
      if (galleryItemSlug(item.file) === slug) {
        return { title: item.title, prompt: item.template };
      }
    }
  }
  return undefined;
}
