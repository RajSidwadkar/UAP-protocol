import { describe, it, expect } from 'vitest';
import { version } from './index';

describe('SDK', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0');
  });
});
