/**
 * Joins class names, filtering out falsy values.
 *
 * @example
 * cx('btn', isActive && 'btn--active', disabled && 'btn--disabled')
 * // → 'btn btn--active'  (when isActive=true, disabled=false)
 */
export function cx(
  ...classes: (string | false | null | undefined | 0)[]
): string {
  const result: string[] = [];
  for (const c of classes) {
    if (c) {
      result.push(c);
    }
  }
  return result.join(' ');
}
