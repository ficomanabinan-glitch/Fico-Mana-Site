/** Local transaction storage is an explicit developer choice, never a production fallback. */
export function localFileStoreAllowed(env: NodeJS.ProcessEnv = process.env) {
  return (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && env.ALLOW_LOCAL_FILE_STORE === 'true'
}

export function assertLocalFileStoreAllowed() {
  if (!localFileStoreAllowed()) throw new Error('Local records are disabled. Use the configured online service.')
}

/** A configured authoritative store owns both found and missing results. */
export async function readAuthoritativeRecord<T>(input: {
  configured: boolean
  online: () => Promise<T | null>
  local: () => Promise<T | null>
}): Promise<T | null> {
  if (input.configured) return input.online()
  assertLocalFileStoreAllowed()
  return input.local()
}
