/**
 * Generate a storage-safe file path.
 * Supabase Storage keys must be ASCII-safe, so we strip non-ASCII chars
 * and replace spaces with underscores.
 */
export function safeStoragePath(projectId: string, category: string, fileName: string): string {
  // Extract extension
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
  // Create safe filename: timestamp + sanitized name
  const safeName = fileName
    .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII
    .replace(/\s+/g, '_')         // Replace spaces
    .replace(/[^a-zA-Z0-9._-]/g, '') // Keep only safe chars
    || 'file'
  return `${projectId}/${category}/${Date.now()}_${safeName || 'upload'}${!safeName.includes('.') ? ext : ''}`
}
