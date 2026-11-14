import { describe, expect, it } from 'vitest'
import {
  MAX_DIMENSION,
  parseBackground,
  parseDimension,
  parseFit,
  parsePosition,
  parseRotation,
} from '../src/validation'

describe('validation helpers', () => {
  describe('parseDimension', () => {
    it('accepts positive integers within bounds', () => {
      expect(parseDimension('1')).toBe(1)
      expect(parseDimension('200')).toBe(200)
      expect(parseDimension(String(MAX_DIMENSION))).toBe(MAX_DIMENSION)
    })

    it('rejects zero, negative, oversized, and non-numeric values', () => {
      expect(parseDimension(undefined)).toBeNull()
      expect(parseDimension('')).toBeNull()
      expect(parseDimension('0')).toBeNull()
      expect(parseDimension('-10')).toBeNull()
      expect(parseDimension('999999999')).toBeNull()
      expect(parseDimension(String(MAX_DIMENSION + 1))).toBeNull()
      expect(parseDimension('abc')).toBeNull()
    })
  })

  describe('parseRotation', () => {
    it('accepts finite integers', () => {
      expect(parseRotation('0')).toBe(0)
      expect(parseRotation('90')).toBe(90)
      expect(parseRotation('-90')).toBe(-90)
    })

    it('rejects non-numeric, empty, and non-finite values', () => {
      expect(parseRotation(undefined)).toBeUndefined()
      expect(parseRotation('')).toBeUndefined()
      expect(parseRotation('abc')).toBeUndefined()
      expect(parseRotation('Infinity')).toBeUndefined()
    })
  })

  describe('parseFit', () => {
    it('accepts valid fit values and defaults invalid ones to cover', () => {
      expect(parseFit('contain')).toBe('contain')
      expect(parseFit('inside')).toBe('inside')
      expect(parseFit('invalid')).toBe('cover')
      expect(parseFit(undefined)).toBe('cover')
    })
  })

  describe('parsePosition', () => {
    it('accepts valid positions and defaults invalid ones to centre', () => {
      expect(parsePosition('top')).toBe('top')
      expect(parsePosition('north')).toBe('north')
      expect(parsePosition('entropy')).toBe('entropy')
      expect(parsePosition('invalid')).toBe('centre')
      expect(parsePosition(undefined)).toBe('centre')
    })
  })

  describe('parseBackground', () => {
    it('accepts valid hex, functional, and named colors', () => {
      expect(parseBackground('#fff')).toBe('#fff')
      expect(parseBackground('#ff00aa')).toBe('#ff00aa')
      expect(parseBackground('rgb(255, 0, 128)')).toBe('rgb(255, 0, 128)')
      expect(parseBackground('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
      expect(parseBackground('red')).toBe('red')
      expect(parseBackground('transparent')).toBe('transparent')
    })

    it('rejects invalid color strings', () => {
      expect(parseBackground(undefined)).toBeUndefined()
      expect(parseBackground('')).toBeUndefined()
      expect(parseBackground('notacolor')).toBeUndefined()
      expect(parseBackground('#zzzzzz')).toBeUndefined()
    })
  })
})
