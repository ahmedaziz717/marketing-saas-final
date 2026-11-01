import { expect, it } from 'vitest';
import { assetMatchingChannels, assetSizeMatches } from '../shared/assetFit';
import type { LibraryAsset } from '../shared/assetLibrary';
const image = (width?: number, height?: number) => ({purpose:'finished',mediaType:'image',width,height}) as LibraryAsset;
it('recognizes a shared landscape across Google, Microsoft and Meta', () => {
  expect(assetMatchingChannels(image(1200,628)).map(c=>c.id)).toEqual(['meta_ads','google_ads','microsoft','facebook','instagram']);
});
it('distinguishes uploaded Google banners from social image placements', () => {
  expect(assetMatchingChannels(image(300,250)).map(c=>c.id)).toEqual(['google_ads']);
  expect(assetMatchingChannels(image(728,90)).map(c=>c.id)).toEqual(['google_ads']);
});
it('applies network-specific dimensions and does not infer unrecorded dimensions', () => {
  expect(assetSizeMatches(image(600,314),'google_ads')).toBe(true);
  expect(assetSizeMatches(image(600,314),'microsoft')).toBe(false);
  expect(assetSizeMatches(image(1080,1920),'microsoft')).toBe(false);
  expect(assetSizeMatches(image(1080,1920),'instagram')).toBe(true);
  expect(assetMatchingChannels(image())).toEqual([]);
  expect(assetMatchingChannels(image(100,100))).toEqual([]);
  expect(assetMatchingChannels({...image(1200,628),purpose:'source'})).toEqual([]);
  expect(assetMatchingChannels({...image(1200,628),mediaType:'video'})).toEqual([]);
});
