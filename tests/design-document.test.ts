import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('design documentation preserves canonical sections and an extensions-only component sidecar', () => {
  const markdown = readFileSync('DESIGN.md', 'utf8')
  const sidecar = JSON.parse(readFileSync('.impeccable/design.json', 'utf8'))
  assert.deepEqual(Array.from(markdown.matchAll(/^## (.+)$/gm), match => match[1]), ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"])
  assert.equal(sidecar.schemaVersion, 2)
  assert.equal(sidecar.tokens, undefined, 'primitive token arrays belong in frontmatter, not sidecar')
  assert.ok(sidecar.components.length >= 5 && sidecar.components.length <= 10)
  assert.match(markdown, /public-legacy: "0rem"/)
  assert.match(markdown, /implementation debt, not a new square-corner brand rule/)
  assert.match(markdown, /not an accessibility conformance or production-readiness certificate/)
  for (const meta of Object.values(sidecar.extensions.colorMeta) as Array<{ tonalRamp: string[] }>) assert.equal(meta.tonalRamp.length, 8)
  for (const component of sidecar.components as Array<{ html: string; css: string }>) {
    assert.match(component.html, /class="ds-/)
    assert.match(component.css, /\.ds-/)
  }
  assert.ok(markdown.includes(sidecar.narrative.overview), 'overview language must not drift between the two artifacts')
})
