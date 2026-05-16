export class ValidationError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

interface StringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

function labelFor(fieldName: string): string {
  return fieldName.slice(0, 1).toUpperCase() + fieldName.slice(1);
}

export function assertBodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function readRequiredString(
  value: unknown,
  fieldName: string,
  options: StringOptions = {},
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${labelFor(fieldName)} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${labelFor(fieldName)} is required.`);
  }

  if (
    options.minLength !== undefined &&
    trimmed.length < options.minLength
  ) {
    throw new ValidationError(
      `${labelFor(fieldName)} must be at least ${options.minLength} characters.`,
    );
  }

  if (
    options.maxLength !== undefined &&
    trimmed.length > options.maxLength
  ) {
    throw new ValidationError(
      `${labelFor(fieldName)} must be at most ${options.maxLength} characters.`,
    );
  }

  if (options.pattern && !options.pattern.test(trimmed)) {
    throw new ValidationError(`${labelFor(fieldName)} is invalid.`);
  }

  return trimmed;
}

export function readOptionalString(
  value: unknown,
  fieldName: string,
  options: StringOptions = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = readRequiredString(value, fieldName, options);
  return trimmed || null;
}

export function readEmail(value: unknown, fieldName = 'email'): string {
  const email = readRequiredString(value, fieldName, { maxLength: 255 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError(`${labelFor(fieldName)} is invalid.`);
  }
  return email.toLowerCase();
}

export function readEnumValue<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  const normalized = readRequiredString(value, fieldName, { maxLength: 64 });
  if (!allowed.includes(normalized as T)) {
    throw new ValidationError(
      `${labelFor(fieldName)} must be one of: ${allowed.join(', ')}.`,
    );
  }
  return normalized as T;
}

export function readHttpUrl(value: unknown, fieldName: string): string {
  const raw = readRequiredString(value, fieldName, { maxLength: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ValidationError(`${labelFor(fieldName)} must be a valid URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(
      `${labelFor(fieldName)} must use http or https.`,
    );
  }

  return raw;
}

export function readPlainObject(
  value: unknown,
  fieldName: string,
  options: { maxKeys?: number; maxSerializedLength?: number } = {},
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${labelFor(fieldName)} must be a JSON object.`);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const maxKeys = options.maxKeys ?? 50;
  if (keys.length > maxKeys) {
    throw new ValidationError(
      `${labelFor(fieldName)} must have at most ${maxKeys} keys.`,
    );
  }

  const serialized = JSON.stringify(record);
  const maxSerializedLength = options.maxSerializedLength ?? 12000;
  if (serialized.length > maxSerializedLength) {
    throw new ValidationError(
      `${labelFor(fieldName)} is too large.`,
    );
  }

  return record;
}
