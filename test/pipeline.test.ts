import { describe, expect, it } from 'vitest'
import { InputLimitExceededError, isFatalInputLimitError } from '../src/pipeline'

describe('pipeline - isFatalInputLimitError', () => {
  it('returns true for InputLimitExceededError instances', () => {
    const err = new InputLimitExceededError('too many pixels')
    expect(err.name).toBe('InputLimitExceededError')
    expect(isFatalInputLimitError(err)).toBe(true)
  })

  it('returns true for Sharp pixel limit error messages', () => {
    expect(isFatalInputLimitError(new Error('Input image exceeds pixel limit'))).toBe(true)
    expect(isFatalInputLimitError(new Error('input image exceeds PIXEL LIMIT'))).toBe(true)
  })

  it('returns true for generic limit exceeded error messages', () => {
    expect(isFatalInputLimitError(new Error('Payload exceeds size limit'))).toBe(true)
  })

  it('returns false for unrelated errors and non-Error values', () => {
    expect(isFatalInputLimitError(new Error('corrupt jpeg'))).toBe(false)
    expect(isFatalInputLimitError(new Error('stream aborted'))).toBe(false)
    expect(isFatalInputLimitError('pixel limit')).toBe(false)
    expect(isFatalInputLimitError(null)).toBe(false)
    expect(isFatalInputLimitError(undefined)).toBe(false)
  })
})
