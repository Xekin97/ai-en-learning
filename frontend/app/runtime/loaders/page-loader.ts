export async function usePageLoader(
  key: string,
  loader: () => Promise<void>,
): Promise<void> {
  await callOnce(`page:${key}`, loader, { mode: "navigation" });
}
