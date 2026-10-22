export function slugify(text: string): string {
  if (!text) return '';

  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // separate accents from letters
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric (keep spaces and dashes)
    .replace(/[\s_-]+/g, '-') // replace spaces, underscores, multiple dashes with single dash
    .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
    .substring(0, 50); // cap length
}
