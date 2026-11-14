import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: {
      tsconfigPath: 'tsconfig.eslint.json',
      parserOptions: {
        project: ['tsconfig.eslint.json'],
        projectService: false,
      },
      overridesTypeAware: {
        'ts/no-deprecated': 'error',
      },
    },
    rules: {
      'max-lines': [
        'warn',
        { max: 250, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['warn', 3],
      'complexity': ['warn', 10],
      'max-params': ['warn', 4],
    },
  },
  {
    files: [
      '**/*.test.ts',
    ],
    rules: {
      'ts/no-unsafe-assignment': 'off',
      'ts/no-unsafe-member-access': 'off',
      'ts/no-unsafe-call': 'off',
      'ts/no-unsafe-argument': 'off',
      'ts/no-unsafe-return': 'off',
    },
  },
) as any
