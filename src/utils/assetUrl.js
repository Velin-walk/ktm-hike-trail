export function resolveAssetUrl(pathname) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (typeof window === 'undefined') {
    return `${process.env.PUBLIC_URL || ''}${cleanPath}`;
  }
  const basePath = process.env.PUBLIC_URL || '';
  return `${basePath}${cleanPath}`.replace(/\/+/g, '/').replace(':/', '://');
}
