import { describe, expect, it } from 'vitest'
import { boundsOf, centerOn, fitTransform, keepCentre, labelVisible, onScreen, toScreen, transformAttr } from './camera.ts'

const view = { width: 1000, height: 500 }
const bounds = boundsOf([{ x: -1000, y: -500 }, { x: 1000, y: 500 }])

describe('fitTransform', () => {
  it('fits the bounds inside the viewport with padding, centred', () => {
    const t = fitTransform(bounds, view, 0)
    expect(t.k).toBeCloseTo(0.5)
    expect(toScreen({ x: 0, y: 0 }, t)).toEqual({ x: 500, y: 250 })
  })

  it('uses the viewport it is given (resized window)', () => {
    expect(fitTransform(bounds, { width: 500, height: 500 }, 0).k).toBeCloseTo(0.25)
    expect(fitTransform(bounds, { width: 4000, height: 2000 }, 0).k).toBeCloseTo(2)
  })

  it('fits the whole map on a phone-width screen instead of clamping to a larger scale', () => {
    const map = boundsOf([{ x: -1000, y: -1000 }, { x: 1000, y: 1000 }])
    expect(fitTransform(map, { width: 390, height: 844 }).k).toBeCloseTo(310 / 2000)
  })

  it('clamps the scale to the zoom extent', () => {
    expect(fitTransform(boundsOf([{ x: 0, y: 0 }, { x: 1, y: 1 }]), view).k).toBe(8)
  })
})

describe('centerOn / onScreen', () => {
  it('puts a point in the middle of the viewport at the given scale', () => {
    const t = centerOn({ x: 100, y: -50 }, view, 2)
    expect(toScreen({ x: 100, y: -50 }, t)).toEqual({ x: 500, y: 250 })
    expect(t.k).toBe(2)
  })

  it('tells whether a point is inside the viewport', () => {
    const t = { x: 0, y: 0, k: 1 }
    expect(onScreen({ x: 10, y: 10 }, t, view)).toBe(true)
    expect(onScreen({ x: -1, y: 10 }, t, view)).toBe(false)
    expect(onScreen({ x: -1, y: 10 }, t, view, 5)).toBe(true)
  })
})

describe('labelVisible', () => {
  const at = (k: number) => ({ x: 0, y: 0, k })
  const node = (radius: number, always = false, point = { x: 10, y: 10 }) => ({ always, radius, point })

  it('always labels anchors, the selection and the focused node', () => {
    expect(labelVisible(node(3, true, { x: -999, y: -999 }), at(0.3), view)).toBe(true)
  })

  it('labels big ranked nodes from 1.5x and every on-screen node from 3x', () => {
    expect(labelVisible(node(12), at(1), view)).toBe(false)
    expect(labelVisible(node(12), at(1.5), view)).toBe(true)
    expect(labelVisible(node(3), at(1.5), view)).toBe(false)
    expect(labelVisible(node(3), at(3), view)).toBe(true)
    expect(labelVisible(node(3, false, { x: 900, y: 900 }), at(3), view)).toBe(false)
  })
})

describe('transformAttr', () => {
  it('formats the SVG transform', () => {
    expect(transformAttr({ x: 5, y: -2, k: 1.5 })).toBe('translate(5 -2) scale(1.5)')
  })
})

describe('keepCentre', () => {
  it('keeps the same world point in the middle and the same scale when the viewport resizes', () => {
    const t = centerOn({ x: 120, y: -40 }, { width: 800, height: 600 }, 2.5)
    const kept = keepCentre(t, { width: 800, height: 600 }, { width: 800, height: 900 })
    expect(kept.k).toBe(2.5)
    expect(toScreen({ x: 120, y: -40 }, kept)).toEqual({ x: 400, y: 450 })
  })
})
