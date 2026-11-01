/** Error reporting and small field checks shared by every validator. */
import { TWO_CHAR_CODE } from './lists';

export type Obj = Record<string, unknown>;

export function isOneOf(v: unknown, allowed: readonly string[]): v is string {
  return typeof v === 'string' && allowed.includes(v);
}

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** True when the optional field is present (not missing or undefined). */
export function has(o: Obj, field: string): boolean {
  return field in o && o[field] !== undefined;
}

export function oneOfText(allowed: readonly string[]): string {
  return `must be one of ${allowed.map((a) => `"${a}"`).join(', ')}`;
}

/** Collects errors with a fixed "<entity>: " prefix. */
export class Reporter {
  constructor(
    private readonly errors: string[],
    private readonly entity: string,
  ) {}

  add(field: string, message: string): void {
    this.errors.push(`${this.entity}: field "${field}" ${message}`);
  }

  obj(o: Obj, field: string): Obj | undefined {
    const v = o[field];
    if (!isObj(v)) {
      this.add(field, 'must be an object');
      return undefined;
    }
    return v;
  }

  str(o: Obj, field: string, path = field): string | undefined {
    const v = o[field];
    if (typeof v !== 'string' || v.length === 0) {
      this.add(path, 'must be a non-empty string');
      return undefined;
    }
    return v;
  }

  bool(o: Obj, field: string, path = field): void {
    if (typeof o[field] !== 'boolean') this.add(path, 'must be a boolean');
  }

  int(o: Obj, field: string, min: number, path = field): number | undefined {
    const v = o[field];
    if (!isNonNegInt(v) || v < min) {
      this.add(path, `must be an integer >= ${min}`);
      return undefined;
    }
    return v;
  }

  oneOf<T extends string>(
    o: Obj,
    field: string,
    allowed: readonly T[],
    path = field,
  ): T | undefined {
    const v = o[field];
    if (!isOneOf(v, allowed)) {
      this.add(path, oneOfText(allowed));
      return undefined;
    }
    return v as T;
  }

  arr(o: Obj, field: string, path = field): unknown[] | undefined {
    const v = o[field];
    if (!Array.isArray(v)) {
      this.add(path, 'must be an array');
      return undefined;
    }
    return v;
  }
}

export function optInt(r: Reporter, o: Obj, field: string, min: number, p: string): void {
  if (has(o, field)) r.int(o, field, min, `${p}.${field}`);
}

export function optBool(r: Reporter, o: Obj, field: string, p: string): void {
  if (has(o, field)) r.bool(o, field, `${p}.${field}`);
}

export function enumList(r: Reporter, o: Obj, field: string, allowed: readonly string[], p: string, nonEmpty = false): void {
  const list = r.arr(o, field, `${p}.${field}`);
  if (!list) return;
  if (nonEmpty && list.length === 0) r.add(`${p}.${field}`, 'must not be empty');
  list.forEach((v, i) => {
    if (!isOneOf(v, allowed)) {
      r.add(`${p}.${field}[${i}]`, oneOfText(allowed));
    }
  });
}

export function checkTwoCharCode(r: Reporter, o: Obj): void {
  r.str(o, 'code');
  if (typeof o.code === 'string' && !TWO_CHAR_CODE.test(o.code)) {
    r.add('code', `"${o.code}" must be exactly 2 characters [A-Za-z0-9]`);
  }
}
