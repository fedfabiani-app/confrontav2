// Soglie sulla media grezza (scala 1-5) che delimitano la banda neutra
export const NEUTRAL_LOW = 2.8;
export const NEUTRAL_HIGH = 3.2;

// Soglie corrispondenti sul valore polarizzato mostrato all'utente
export const OUT_LOW = 3.2;
export const OUT_HIGH = 3.8;

const DOMAIN_MIN = 1;
const DOMAIN_MAX = 5;

// Rimappa una media grezza (1-5) in un valore più polarizzato: sotto NEUTRAL_LOW
// finisce sempre sotto OUT_LOW, sopra NEUTRAL_HIGH finisce sempre sopra OUT_HIGH,
// mentre la banda neutra centrale viene stirata nell'intervallo [OUT_LOW, OUT_HIGH].
export function polarizeRating(raw: number): number {
  const clamped = Math.min(DOMAIN_MAX, Math.max(DOMAIN_MIN, raw));

  if (clamped <= NEUTRAL_LOW) {
    return DOMAIN_MIN + (clamped - DOMAIN_MIN) * ((OUT_LOW - DOMAIN_MIN) / (NEUTRAL_LOW - DOMAIN_MIN));
  }
  if (clamped >= NEUTRAL_HIGH) {
    return OUT_HIGH + (clamped - NEUTRAL_HIGH) * ((DOMAIN_MAX - OUT_HIGH) / (DOMAIN_MAX - NEUTRAL_HIGH));
  }
  return OUT_LOW + (clamped - NEUTRAL_LOW) * ((OUT_HIGH - OUT_LOW) / (NEUTRAL_HIGH - NEUTRAL_LOW));
}

export function toneFromRawAverage(raw: number | null): 'positive' | 'neutral' | 'negative' {
  if (raw === null) return 'neutral';
  if (raw < NEUTRAL_LOW) return 'negative';
  if (raw > NEUTRAL_HIGH) return 'positive';
  return 'neutral';
}
