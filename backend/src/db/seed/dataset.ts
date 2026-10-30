import { createSeed, type Dataset } from '@tgs/mock-data';

let cached: Dataset | undefined;

/** The demo dataset, built once per process (it is deterministic; building it takes a second). */
export function demoDataset(): Dataset {
  cached ??= createSeed();
  return cached;
}
