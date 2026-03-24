import { describe, it, expect } from 'vitest';
import { truncate, toTitleCase, isValidEmail, slugify } from '@src/utils/string.js';

describe('truncate', () => {
  it('returns the string unchanged when within max length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis when over max length', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('returns unchanged when exactly at max length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('toTitleCase', () => {
  it('converts lowercase string to title case', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });

  it('handles already-uppercase input', () => {
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(toTitleCase('playwright')).toBe('Playwright');
  });

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('');
  });
});

describe('isValidEmail', () => {
  it('returns true for valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.domain.co')).toBe(true);
  });

  it('returns false for invalid email addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@missing-local.com')).toBe(false);
    expect(isValidEmail('missing-domain@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('slugify', () => {
  it('converts a phrase to a URL slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
