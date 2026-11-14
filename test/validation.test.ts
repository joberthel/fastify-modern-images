import { describe, expect, it } from 'vitest'
import {
  isNonEmpty,
  MAX_DIMENSION,
  parseBackground,
  parseDimension,
  parseFit,
  parsePosition,
  parseQuality,
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
      expect(parseBackground('rgb(100%, 50%, 0%)')).toBe('rgb(100%, 50%, 0%)')
      expect(parseBackground('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
      expect(parseBackground('rgba(100%, 50%, 0%, .5)')).toBe('rgba(100%, 50%, 0%, .5)')
      expect(parseBackground('hsl(120, 100%, 50%)')).toBe('hsl(120, 100%, 50%)')
      expect(parseBackground('hsla(120, 100%, 50%, 1)')).toBe('hsla(120, 100%, 50%, 1)')
      expect(parseBackground('red')).toBe('red')
      expect(parseBackground('transparent')).toBe('transparent')
    })

    it('rejects invalid color strings', () => {
      expect(parseBackground(undefined)).toBeUndefined()
      expect(parseBackground('')).toBeUndefined()
      expect(parseBackground('notacolor')).toBeUndefined()
      expect(parseBackground('#zzzzzz')).toBeUndefined()
      expect(parseBackground('hsl(10, 20, 30)')).toBeUndefined()
      expect(parseBackground('hsl(10%, 20%, 30%)')).toBeUndefined()
      expect(parseBackground('hsl(10, 20%, 30)')).toBeUndefined()
      expect(parseBackground('rgb(10%, 20, 30)')).toBeUndefined()
      expect(parseBackground('rgb(10, 20%, 30)')).toBeUndefined()
      expect(parseBackground('rgba(0, 0, 0, 1.5)')).toBeUndefined()
      expect(parseBackground('rgba(0, 0, 0, 50%)')).toBeUndefined()
    })
  })

  describe('isNonEmpty', () => {
    it('returns true only for non-empty strings', () => {
      expect(isNonEmpty('a')).toBe(true)
      expect(isNonEmpty('')).toBe(false)
      expect(isNonEmpty(undefined)).toBe(false)
      expect(isNonEmpty(['red', 'blue'])).toBe(false)
      expect(isNonEmpty(123)).toBe(false)
      expect(isNonEmpty(null)).toBe(false)
    })
  })

  describe('parseQuality', () => {
    const qualityMap = { 9: 95, 7: 85, 1: 40 }

    it('returns mapped quality for valid keys', () => {
      expect(parseQuality('9', qualityMap, '7')).toBe(95)
      expect(parseQuality('1', qualityMap, '7')).toBe(40)
    })

    it('falls back to default quality for invalid, empty, non-string, or prototype keys', () => {
      expect(parseQuality(undefined, qualityMap, '7')).toBe(85)
      expect(parseQuality('', qualityMap, '7')).toBe(85)
      expect(parseQuality('invalid', qualityMap, '7')).toBe(85)
      expect(parseQuality('99', qualityMap, '7')).toBe(85)
      expect(parseQuality('toString', qualityMap, '7')).toBe(85)
      expect(parseQuality('constructor', qualityMap, '7')).toBe(85)
      expect(parseQuality('__proto__', qualityMap, '7')).toBe(85)
      expect(parseQuality(['9', '1'], qualityMap, '7')).toBe(85)
      expect(parseQuality('invalid', qualityMap, 'missing')).toBeUndefined()
    })
  })

  describe('querystring array pollution', () => {
    it('safely rejects array values in all parsers', () => {
      const polluted = ['red', 'blue'] as unknown as string
      expect(parseDimension(polluted)).toBeNull()
      expect(parseRotation(polluted)).toBeUndefined()
      expect(parseFit(polluted)).toBe('cover')
      expect(parsePosition(polluted)).toBe('centre')
      expect(parseBackground(polluted)).toBeUndefined()
      expect(parseQuality(polluted, { 7: 85 }, '7')).toBe(85)
    })
  })
})
