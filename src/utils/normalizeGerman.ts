const TRAILING_PUNCTUATION = /[.!?\s]+$/g;

export const normalizeGerman = (value: string) => {
  const trimmed = value.trim().replace(TRAILING_PUNCTUATION, "");
  return trimmed;
};
