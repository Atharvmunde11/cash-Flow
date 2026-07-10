export function withMongoId<T extends { id: string }>(row: T): T & { _id: string } {
  return { ...row, _id: row.id };
}

export function withMongoIds<T extends { id: string }>(
  rows: T[],
): Array<T & { _id: string }> {
  return rows.map(withMongoId);
}

