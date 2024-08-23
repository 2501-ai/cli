/**
 * Checks if an object is either null or undefined using the loose equality operator.
 *
 * Using the loose equality operator (==) instead of the strict equality operator (===) allows for null and undefined to be considered equal,
 * and is A LOT faster than using the strict equality operator.
 * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Equality
 *
 * @param {any} obj - The object to check.
 * @return {boolean} - Returns `true` if the object is either null or undefined, else `false`.
 */
export function isNullOrUndefined(obj: unknown): obj is undefined | null {
  return obj == null;
}
