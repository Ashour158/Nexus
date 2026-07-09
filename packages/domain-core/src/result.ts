export type DomainSuccess<T> = {
  ok: true;
  value: T;
};

export type DomainFailure<E extends Error = Error> = {
  ok: false;
  error: E;
};

export type DomainResult<T, E extends Error = Error> = DomainSuccess<T> | DomainFailure<E>;

export function ok<T>(value: T): DomainSuccess<T> {
  return { ok: true, value };
}

export function err<E extends Error>(error: E): DomainFailure<E> {
  return { ok: false, error };
}

export function isOk<T, E extends Error>(result: DomainResult<T, E>): result is DomainSuccess<T> {
  return result.ok;
}

export function isErr<T, E extends Error>(result: DomainResult<T, E>): result is DomainFailure<E> {
  return !result.ok;
}
