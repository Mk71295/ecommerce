export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export function toPage<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Page<T> {
  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}
