import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads quoted commas, quotes and line breaks, skips blank lines and a BOM', () => {
    const rows = parseCsv('﻿a, b ,c\r\n1,"x, ""y""","line1\nline2"\r\n\r\n2,,\n');
    expect(rows).toEqual([
      { a: '1', b: 'x, "y"', c: 'line1\nline2' },
      { a: '2', b: '', c: '' },
    ]);
  });
  it('gives nothing for an empty file', () => expect(parseCsv('')).toEqual([]));
});
