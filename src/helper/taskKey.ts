export function extractTaskKey(branchName: string | undefined, pattern: string): string | undefined {
  if (!branchName) {
    return undefined;
  }

  try {
    const re = new RegExp(pattern, 'i');
    const match = branchName.match(re);
    return match?.[0]?.toUpperCase();
  } catch {
    return undefined;
  }
}
