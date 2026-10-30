export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

export const isPositiveAmount = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

// A single Firestore document ID: a slash would point into a subcollection instead
export const isDocId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128
  && !value.includes('/') && value !== '.' && value !== '..';

export const isUsername = (value) => isDocId(value) && USERNAME_PATTERN.test(value);
