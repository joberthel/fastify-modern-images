import type { MinifyQuerystring } from '../src/types'
import { describe, expect, it } from 'vitest'

describe('minifyQuerystring types', () => {
  it('allows empty and partial MinifyQuerystring objects without required shortcut properties', () => {
    const empty: MinifyQuerystring = {}
    const partial: MinifyQuerystring = { w: '100' }

    expect(empty).toEqual({})
    expect(partial).toEqual({ w: '100' })
  })
})
