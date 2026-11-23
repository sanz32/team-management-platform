export function getAppDownloadUrl(): string | null {
  const url = process.env.DESKTOP_APP_DOWNLOAD_URL?.trim();
  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) return null;

  return url;
}

export function isAppDownloadAvailable(): boolean {
  return getAppDownloadUrl() !== null;
}
