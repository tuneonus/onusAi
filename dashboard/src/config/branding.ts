import rawBranding from '../../../packages/branding/branding.json';
import type { PublicBranding } from '../types/api';

function readBrandField(field: keyof PublicBranding): string {
  const value = rawBranding[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid centralized branding field: ${field}`);
  }

  return value.trim();
}

export const defaultBranding: PublicBranding = Object.freeze({
  productName: readBrandField('productName'),
  shortName: readBrandField('shortName'),
  tagline: readBrandField('tagline'),
  attributionText: readBrandField('attributionText'),
});

