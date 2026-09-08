const COMMON_LANGUAGES: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  zh: 'Chinese',
  hi: 'Hindi',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  el: 'Greek',
  he: 'Hebrew',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  fa: 'Persian',
  uk: 'Ukrainian',
  ur: 'Urdu',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  mr: 'Marathi',
  pa: 'Punjabi',
  gu: 'Gujarati',
};

export function getLanguageName(code?: string | null): string | null {
  if (!code) return null;
  const clean = code.toLowerCase().trim();
  if (COMMON_LANGUAGES[clean]) return COMMON_LANGUAGES[clean];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = dn.of(clean);
    if (name) return name;
  } catch {
    // Fallback
  }
  return clean.toUpperCase();
}
