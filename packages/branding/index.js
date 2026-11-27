import { readFileSync } from 'node:fs';

const brandingJson = JSON.parse(
  readFileSync(new URL('./branding.json', import.meta.url), 'utf8'),
);

export const publicBranding = Object.freeze({
  productName: brandingJson.productName,
  shortName: brandingJson.shortName,
  tagline: brandingJson.tagline,
  attributionText: brandingJson.attributionText,
});

