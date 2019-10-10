/**
 * パス先頭のスラッシュを除去します。
 * @param path
 */
export function removeStartSlash(path?: string): string {
  if (!path) return ''
  return path.replace(/^\//, '')
}

/**
 * パス末尾のスラッシュを除去します。
 * @param path
 */
export function removeEndSlash(path?: string): string {
  if (!path) return ''
  return path.replace(/\/$/, '')
}

/**
 * パスの両端のスラッシュを除去します。
 * @param path
 */
export function removeBothEndsSlash(path?: string): string {
  if (!path) return ''
  return removeStartSlash(removeEndSlash(path))
}

/**
 * ファイルパスをファイル名とディレクトリパスに分割します。
 * @param filePath
 */
export function splitFilePath(filePath: string): { fileName: string; dirPath: string } {
  const segments = filePath.split('/')
  const fileName = segments[segments.length - 1]
  let dirPath = ''
  if (segments.length >= 2) {
    dirPath = segments.slice(0, segments.length - 1).join('/')
  }
  return { fileName, dirPath }
}
