import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as addonPhotoRules from '../../lib/addon-photo-rules.ts'
import * as enhancedUploadNaming from '../../lib/enhanced-upload-naming.ts'
import * as portalPagePayload from '../../lib/portal-page-payload.ts'

const require = createRequire(import.meta.url)

/** Execute actual server/component code with explicit boundary stubs, never live services. */
export function loadTs<T>(path: string, stubs: Record<string, unknown>, source?: string): T {
  const output = ts.transpileModule(source ?? readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: path,
  }).outputText
  const loadedModule = { exports: {} }
  const boundaryRequire = (name: string) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    // Pure catalog rules run unchanged; only external service boundaries are mocked.
    if (name === '@/lib/addon-photo-rules') return addonPhotoRules
    if (name === '@/lib/enhanced-upload-naming') return enhancedUploadNaming
    if (name === '@/lib/portal-page-payload') return portalPagePayload
    if (name.startsWith('node:') || ['react', 'react/jsx-runtime', 'lucide-react'].includes(name)) return require(name)
    throw new Error(`Unstubbed dependency: ${name}`)
  }
  new Function('require', 'module', 'exports', output)(boundaryRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports as T
}
