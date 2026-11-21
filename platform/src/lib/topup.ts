export type TopupPack = {
  id: string;
  name: string;
  tagline: string;
  inrPaise: number;
  tokens: number;
};

export const TOPUP_PACKS: TopupPack[] = [
  { id: 'starter', name: 'Starter', tagline: 'A taste of more tokens', inrPaise: 49900, tokens: 200_000 },
  { id: 'booster', name: 'Booster', tagline: 'Most popular top-up', inrPaise: 99900, tokens: 500_000 },
  { id: 'turbo', name: 'Turbo', tagline: 'Keep a big reserve', inrPaise: 169900, tokens: 1_200_000 },
];

export function findTopupPack(id: string): TopupPack | null {
  return TOPUP_PACKS.find((p) => p.id === id) ?? null;
}
