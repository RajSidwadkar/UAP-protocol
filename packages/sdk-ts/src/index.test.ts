import { describe, it, expect } from 'vitest';
import { version } from './index.js';

describe('SDK', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0');
  });
});
