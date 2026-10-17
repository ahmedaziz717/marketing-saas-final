const key = (userId: number) => `evokeloop-workspace:${userId}`;
export function selectedWorkspace(userId?: number) {
  try {
    return userId
      ? Number(localStorage.getItem(key(userId))) || undefined
      : undefined;
  } catch {
    return undefined;
  }
}
export function rememberWorkspace(userId: number, organizationId: number) {
  try {
    localStorage.setItem(key(userId), String(organizationId));
  } catch {
    /* Storage can be disabled. */
  }
}
