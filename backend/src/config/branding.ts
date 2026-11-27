import { readFileSync } from 'node:fs';

export interface PublicBranding {
  readonly productName: string;
  readonly shortName: string;
  readonly tagline: string;
  readonly attributionText: string;
}

// Both src/config and dist/config share depth 3 relative to the repository root.
const brandingUrl = new URL('../../../packages/branding/branding.json', import.meta.url);
const parsed = JSON.parse(readFileSync(brandingUrl, 'utf8')) as Record<string, unknown>;

function readBrandField(field: keyof PublicBranding): string {
  const value = parsed[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid centralized branding field: ${field}`);
  }

  return value.trim();
}

export const branding: PublicBranding = Object.freeze({
  productName: readBrandField('productName'),
  shortName: readBrandField('shortName'),
  tagline: readBrandField('tagline'),
  attributionText: readBrandField('attributionText'),
});
