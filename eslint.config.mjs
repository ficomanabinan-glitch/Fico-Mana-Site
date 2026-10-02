import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const config = [
  {
    // An ignores-only entry is global; mixing rules here would still lint these
    // generated/tooling files with the Next.js configurations below.
    ignores: [
      '.next/**',
      '.next-qa/**',
      '.vercel/**',
      'node_modules/**',
      '.staging-data/**',
      '.audit/**',
      '.impeccable/**',
      '.agents/**',
      '.codex/**',
      '.pnpm-store/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      'ficomana-proposal-newui/**',
      'public/**',
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'prefer-const': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
]

export default config
