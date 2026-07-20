export function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
