export function truncateForAudit(sql: string, maxLen = 500): string {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLen
    ? normalized
    : `${normalized.slice(0, maxLen)}…`;
}
