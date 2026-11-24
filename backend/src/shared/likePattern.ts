/** Escape LIKE wildcards so user text cannot widen a search. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function likeContains(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

/** Match a JSON array element exactly, so "app" does not hit "mobile-app". */
export function likeJsonStringElement(value: string): string {
  return `%"${escapeLikePattern(value)}"%`;
}
