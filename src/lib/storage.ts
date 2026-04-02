/**
 * Generate a storage-safe file path.
 * Supabase Storage keys must be ASCII-safe.
 * Uses projectId + category + unique ID to guarantee no collisions.
 */
export function safeStoragePath(projectId: string, category: string, fileName: string): string {
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : ''
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return `${projectId}/${category}/${uniqueId}${ext}`
}
