import { describe, expect, it } from 'vitest'
import {
  guard,
  isNonEmptyString,
  isTransparentBackground,
  matchesUrlPattern,
  MAX_DIMENSION,
  normalizeTransformParams,
  parseBackground,
  parseDimension,
  parseFit,
  parsePosition,
  parseQuality,
  parseRotation,
  parseTrim,
} from '../src/validation'

describe('validation helpers', () => {
  describe('parseDimension', () => {
    it('accepts positive integers within bounds', () => {
      expect(MAX_DIMENSION).toBe(4096)
      expect(parseDimension('1')).toBe(1)
      expect(parseDimension('200')).toBe(200)
      expect(parseDimension(String(MAX_DIMENSION))).toBe(MAX_DIMENSION)
      expect(parseDimension('8192', 8192)).toBe(8192)
    })

    it('rejects zero, negative, oversized, and non-numeric values', () => {
      expect(parseDimension(undefined)).toBeNull()
      expect(parseDimension('')).toBeNull()
      expect(parseDimension('0')).toBeNull()
      expect(parseDimension('-10')).toBeNull()
      expect(parseDimension('999999999')).toBeNull()
      expect(parseDimension(String(MAX_DIMENSION + 1))).toBeNull()
      expect(parseDimension('501', 500)).toBeNull()
      expect(parseDimension('abc')).toBeNull()
      expect(parseDimension('150px')).toBeNull()
      expect(parseDimension('100.5')).toBeNull()
      expect(parseDimension(' 100')).toBeNull()
    })

    it('restricts dimensions to allowedDimensions when provided', () => {
      const allowed = [320, 640, 1280]
      expect(parseDimension('320', MAX_DIMENSION, allowed)).toBe(320)
      expect(parseDimension('640', MAX_DIMENSION, allowed)).toBe(640)
      expect(parseDimension('1280', MAX_DIMENSION, allowed)).toBe(1280)
      expect(parseDimension('100', MAX_DIMENSION, allowed)).toBeNull()
      expect(parseDimension('641', MAX_DIMENSION, allowed)).toBeNull()
      expect(parseDimension('1280', 1000, allowed)).toBeNull()
      expect(parseDimension('320', MAX_DIMENSION, [])).toBeNull()
    })
  })

  describe('parseRotation', () => {
    it('accepts finite integers within [-360, 360]', () => {
      expect(parseRotation('0')).toBe(0)
      expect(parseRotation('45')).toBe(45)
      expect(parseRotation('-45')).toBe(-45)
      expect(parseRotation('90')).toBe(90)
      expect(parseRotation('-90')).toBe(-90)
      expect(parseRotation('360')).toBe(360)
      expect(parseRotation('-360')).toBe(-360)
    })

    it('rejects non-numeric, empty, out-of-bounds, and non-finite values', () => {
      expect(parseRotation(undefined)).toBeUndefined()
      expect(parseRotation('')).toBeUndefined()
      expect(parseRotation('abc')).toBeUndefined()
      expect(parseRotation('Infinity')).toBeUndefined()
      expect(parseRotation('90deg')).toBeUndefined()
      expect(parseRotation('90.5')).toBeUndefined()
      expect(parseRotation('361')).toBeUndefined()
      expect(parseRotation('-361')).toBeUndefined()
      expect(parseRotation('99999999')).toBeUndefined()
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
      expect(parseBackground('rgb(255.0, 254.9, 0)')).toBe('rgb(255.0, 254.9, 0)')
      expect(parseBackground('rgb(100%, 50%, 0%)')).toBe('rgb(100%, 50%, 0%)')
      expect(parseBackground('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
      expect(parseBackground('rgba(100%, 50%, 0%, .5)')).toBe('rgba(100%, 50%, 0%, .5)')
      expect(parseBackground('hsl(120, 100%, 50%)')).toBe('hsl(120, 100%, 50%)')
      expect(parseBackground('hsl(360, 100%, 0%)')).toBe('hsl(360, 100%, 0%)')
      expect(parseBackground('hsl(360.0, 100.0%, 50.5%)')).toBe('hsl(360.0, 100.0%, 50.5%)')
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
      expect(parseBackground('rgb(256, 0, 0)')).toBeUndefined()
      expect(parseBackground('rgb(255.5, 0, 0)')).toBeUndefined()
      expect(parseBackground('rgb(999, 999, 999)')).toBeUndefined()
      expect(parseBackground('rgb(101%, 0%, 0%)')).toBeUndefined()
      expect(parseBackground('hsl(361, 50%, 50%)')).toBeUndefined()
      expect(parseBackground('hsl(360.5, 50%, 50%)')).toBeUndefined()
      expect(parseBackground('hsl(999, 999%, 999%)')).toBeUndefined()
      expect(parseBackground('hsl(120, 101%, 50%)')).toBeUndefined()
    })
  })

  describe('isNonEmptyString', () => {
    it('returns true only for non-empty strings', () => {
      expect(isNonEmptyString('a')).toBe(true)
      expect(isNonEmptyString('')).toBe(false)
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(['red', 'blue'])).toBe(false)
      expect(isNonEmptyString(123)).toBe(false)
      expect(isNonEmptyString(null)).toBe(false)
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
      expect(parseTrim(polluted)).toBe(false)
    })
  })

  describe('parseTrim', () => {
    it('returns true only for empty string, true, and 1 (case-insensitive)', () => {
      expect(parseTrim('')).toBe(true)
      expect(parseTrim('true')).toBe(true)
      expect(parseTrim('TRUE')).toBe(true)
      expect(parseTrim('1')).toBe(true)
    })

    it('returns false for undefined, false, 0, unrecognized strings, and non-string values', () => {
      expect(parseTrim(undefined)).toBe(false)
      expect(parseTrim('false')).toBe(false)
      expect(parseTrim('FALSE')).toBe(false)
      expect(parseTrim('0')).toBe(false)
      expect(parseTrim('yes')).toBe(false)
      expect(parseTrim('no')).toBe(false)
      expect(parseTrim('off')).toBe(false)
      expect(parseTrim('invalid')).toBe(false)
      expect(parseTrim(['true'])).toBe(false)
    })
  })

  describe('matchesUrlPattern', () => {
    it('should match url pattern', () => {
      expect(matchesUrlPattern(/\/foo-bar/, '/foo-bar/hello-world.jpg')).toBe(true)
      expect(matchesUrlPattern(/\/foo-bar/, '/bar-foo/hello-world.jpg')).toBe(false)
      expect(matchesUrlPattern(/\/foo-bar/, undefined)).toBe(false)

      const globalRegex = /\/foo-bar/g
      expect(matchesUrlPattern(globalRegex, '/foo-bar/hello-world.jpg')).toBe(true)
      expect(matchesUrlPattern(globalRegex, '/foo-bar/hello-world.jpg')).toBe(true)

      const stickyRegex = /\/foo-bar/y
      expect(matchesUrlPattern(stickyRegex, '/foo-bar/hello-world.jpg')).toBe(true)
      expect(matchesUrlPattern(stickyRegex, '/foo-bar/hello-world.jpg')).toBe(true)

      expect(guard).toBe(matchesUrlPattern)
    })
  })

  describe('normalizeTransformParams', () => {
    it('clears both dimensions when any provided dimension fails validation', () => {
      expect(normalizeTransformParams({ width: '500', height: '600' }, 500)).toMatchObject({
        width: null,
        height: null,
      })
      expect(normalizeTransformParams({ width: '500', height: '600' }, undefined, [500])).toMatchObject({
        width: null,
        height: null,
      })
      expect(normalizeTransformParams({ width: 'abc', height: '500' })).toMatchObject({
        width: null,
        height: null,
      })
    })

    it('keeps a single valid dimension when the other is omitted or empty', () => {
      expect(normalizeTransformParams({ width: '500' }, 500)).toMatchObject({
        width: 500,
        height: null,
      })
      expect(normalizeTransformParams({ width: '500', height: '' }, 500)).toMatchObject({
        width: 500,
        height: null,
      })
    })
  })

  describe('isTransparentBackground', () => {
    it('returns true for transparent keyword and alpha < 1 hex or functional colors', () => {
      expect(isTransparentBackground('transparent')).toBe(true)
      expect(isTransparentBackground('TRANSPARENT')).toBe(true)
      expect(isTransparentBackground(' transparent ')).toBe(true)
      expect(isTransparentBackground('#0000')).toBe(true)
      expect(isTransparentBackground('#ff000080')).toBe(true)
      expect(isTransparentBackground('#00000000')).toBe(true)
      expect(isTransparentBackground('rgba(0, 0, 0, 0)')).toBe(true)
      expect(isTransparentBackground('rgba(255, 0, 0, 0.5)')).toBe(true)
      expect(isTransparentBackground('rgba(255, 0, 0, .5)')).toBe(true)
      expect(isTransparentBackground('rgb(0, 0, 0, 0)')).toBe(true)
      expect(isTransparentBackground('hsla(120, 100%, 50%, 0)')).toBe(true)
      expect(isTransparentBackground('hsla(120, 100%, 50%, 0.25)')).toBe(true)
      expect(isTransparentBackground('hsl(120, 100%, 50%, 0)')).toBe(true)
    })

    it('returns false for undefined, empty, and opaque colors', () => {
      expect(isTransparentBackground(undefined)).toBe(false)
      expect(isTransparentBackground('')).toBe(false)
      expect(isTransparentBackground('red')).toBe(false)
      expect(isTransparentBackground('white')).toBe(false)
      expect(isTransparentBackground('#fff')).toBe(false)
      expect(isTransparentBackground('#ff0000')).toBe(false)
      expect(isTransparentBackground('#ffff')).toBe(false)
      expect(isTransparentBackground('#ffffffff')).toBe(false)
      expect(isTransparentBackground('rgb(255, 0, 0)')).toBe(false)
      expect(isTransparentBackground('rgba(255, 0, 0, 1)')).toBe(false)
      expect(isTransparentBackground('rgba(255, 0, 0, 1.0)')).toBe(false)
      expect(isTransparentBackground('hsl(120, 100%, 50%)')).toBe(false)
      expect(isTransparentBackground('hsla(120, 100%, 50%, 1)')).toBe(false)
      expect(isTransparentBackground('hsla(120, 100%, 50%, 1.0)')).toBe(false)
      expect(isTransparentBackground('rgb')).toBe(false)
      expect(isTransparentBackground('rgba(255, 0, 0')).toBe(false)
    })
  })
})
