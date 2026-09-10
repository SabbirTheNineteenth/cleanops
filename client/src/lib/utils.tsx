import clsx, { type ClassValue } from "clsx";

/** Combines conditional Tailwind classes without duplicating view logic. */
export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}
