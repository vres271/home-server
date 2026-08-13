export type FilterType = 'season' | 'quality' | 'hdr' | 'translation';

export interface Filter {
  id: string;
  type: FilterType;
  label: string;
  values: FilterValue[];
  persistable: boolean;
}

export interface FilterValue {
  id: string;
  label: string;
  pattern: RegExp;
  selected: boolean;
}

// ─── 1. КАЧЕСТВО ───────────────────────────────────────────
export const QUALITY_FILTER: Filter = {
  id: 'quality',
  type: 'quality',
  label: 'Качество',
  persistable: true,
  values: [
    { id: '4k', label: '4K / 2160p', pattern: /\b2160p\b|\b4K\b/i, selected: false },
    { id: '1080p', label: '1080p', pattern: /\b1080p\b/i, selected: false },
    { id: '720p', label: '720p', pattern: /\b720p\b/i, selected: false },
    { id: 'remux', label: 'Remux', pattern: /\bBDRemux\b|\bUHD\s*BDRemux\b/i, selected: false },
    { id: 'web', label: 'WEB-DL / WEB-DLRip', pattern: /\bWEB-DL\b|\bWEB-DLRip\b/i, selected: false },
    { id: 'bdrip', label: 'BDRip', pattern: /\bBDRip\b/i, selected: false }
  ]
};

// ─── 2. HDR ────────────────────────────────────────────────
export const HDR_FILTER: Filter = {
  id: 'hdr',
  type: 'hdr',
  label: 'HDR формат',
  persistable: true,
  values: [
    { id: 'dolby_vision', label: 'Dolby Vision', pattern: /\bDolby\s*Vision\b|\bDV\b(?!D)/i, selected: false }, // (?!D) чтобы не ловить DVD
    { id: 'hdr10_plus', label: 'HDR10+', pattern: /\bHDR10\+\b/i, selected: false },
    { id: 'hdr10', label: 'HDR10', pattern: /\bHDR10\b(?!\\+)/i, selected: false },
    { id: 'hdr', label: 'HDR (общий)', pattern: /\bHDR\b/i, selected: false },
    { id: 'sdr', label: 'SDR', pattern: /\bSDR\b/i, selected: false }
  ]
};

// ─── 3. ПЕРЕВОД / ОЗВУЧКА ──────────────────────────────────
export const TRANSLATION_FILTER: Filter = {
  id: 'translation',
  type: 'translation',
  label: 'Перевод / Озвучка',
  persistable: true,
  values: [
    { 
      id: 'licensed', 
      label: 'Лицензия / Официальный', 
      // Ловим "Лицензия", "| D |" (Дубляж), "| P |" (Профессиональный), Amedia, FOX
      pattern: /\bЛицензия\b|\|\s*D\s*\||\|\s*P\s*\||\bДубляж\b|\bAmedia\b|\bFOX\b/i, 
      selected: false 
    },
    { id: 'lostfilm', label: 'LostFilm', pattern: /\bLostFilm\b/i, selected: false },
    { id: 'alexfilm', label: 'AlexFilm', pattern: /\bAlexFilm\b/i, selected: false },
    { id: 'hdrezka', label: 'HDrezka', pattern: /\bHDrezka\b/i, selected: false },
    { id: 'sndk', label: 'Сыендук', pattern: /(^|\s|\|)Сыендук(\s|\||$)/i, selected: false },
    { id: 'kravets', label: 'Кравец', pattern: /\bКравец\b/i, selected: false },
    { id: 'jaskier', label: 'Jaskier', pattern: /\bJaskier\b/i, selected: false },
    { id: 'newcomers', label: 'NewComers', pattern: /\bNewComers\b/i, selected: false },
    { id: 'syncmer', label: 'Syncmer', pattern: /\bSyncmer\b/i, selected: false },
    { id: 'amateur', label: 'Любительский', pattern: /\bGeneralfilm\b|\bTwister\b|\bExKinoRay\b|\bqqss44\b|\bMegaPeer\b/i, selected: false }
  ]
};