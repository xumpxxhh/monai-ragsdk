export async function invokeObserverSafely(
  callback: (() => void | Promise<void>) | undefined,
): Promise<boolean> {
  if (!callback) {
    return true;
  }

  try {
    await callback();
    return true;
  } catch {
    return false;
  }
}
