export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Accepts common Zambian phone formats and normalizes to +260XXXXXXXXX */
export function normalizeZambianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+260\d{9}$/.test(digits)) return digits;
  if (/^260\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+260${digits.slice(1)}`;
  return null;
}

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}
