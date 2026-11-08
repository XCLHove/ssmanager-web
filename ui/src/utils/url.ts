/** 将后端返回的相对 URL 按当前页面地址补全（HTTPS 页面自动得到 HTTPS URL） */
export function toAbsoluteUrl(url?: string | null): string {
  if (!url) return ''
  try {
    return new URL(url, window.location.origin).toString()
  } catch {
    return url
  }
}
