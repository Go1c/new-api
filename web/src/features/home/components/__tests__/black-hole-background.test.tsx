/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BlackHoleBackground } from '../black-hole-background'

function createWebGLContext() {
  return {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    UNPACK_FLIP_Y_WEBGL: 37440,
    TEXTURE0: 33984,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn(() => ({})),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
  }
}

let context: ReturnType<typeof createWebGLContext>
let frames: Map<number, FrameRequestCallback>
let motionQuery: MediaQueryList
let mediaEvents: EventTarget
let onIntersection: IntersectionObserverCallback
let disconnectIntersection: ReturnType<typeof vi.fn>
let hidden: boolean

beforeEach(() => {
  context = createWebGLContext()
  frames = new Map()
  let frameId = 0
  hidden = false
  mediaEvents = new EventTarget()
  motionQuery = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
    removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
    dispatchEvent: mediaEvents.dispatchEvent.bind(mediaEvents),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(motionQuery)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as WebGLRenderingContext
  )
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
    1536
  )
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(
    1024
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1440,
    height: 900,
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1440,
    bottom: 900,
    toJSON: () => ({}),
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  disconnectIntersection = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersection = callback
      }
      observe() {}
      disconnect = disconnectIntersection
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function loadBackground() {
  fireEvent.load(screen.getByAltText(''))
}

function nextFrame(time: number) {
  const [id, callback] = [...frames.entries()][0] ?? []
  if (id === undefined || !callback) {
    throw new Error('No animation frame is pending')
  }
  frames.delete(id)
  act(() => {
    callback(time)
  })
}

function setIntersection(isIntersecting: boolean) {
  act(() => {
    onIntersection(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  })
}

describe('BlackHoleBackground', () => {
  it('keeps the AIGC image visible when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { container } = render(<BlackHoleBackground />)
    loadBackground()

    expect(screen.getByAltText('')).toHaveAttribute(
      'src',
      '/images/home/event-horizon.webp'
    )
    expect(screen.getByAltText('')).toBeVisible()
    expect(
      screen.getByAltText('').closest('[aria-hidden="true"]')
    ).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeVisible()
    expect(frames.size).toBe(0)
  })

  it('renders successive animation frames after the image has loaded', () => {
    const { container } = render(<BlackHoleBackground />)
    expect(frames.size).toBe(0)
    loadBackground()
    const draws = context.drawArrays.mock.calls.length

    nextFrame(100)
    nextFrame(200)

    expect(container.querySelector('canvas')).toBeVisible()
    expect(context.drawArrays.mock.calls.length).toBeGreaterThan(draws)
    expect(frames.size).toBe(1)
  })

  it('displays a static image when reduced motion is enabled and responds to preference changes', () => {
    Object.defineProperty(motionQuery, 'matches', {
      configurable: true,
      value: true,
    })
    const { container } = render(<BlackHoleBackground />)
    loadBackground()

    expect(frames.size).toBe(0)
    expect(container.querySelector('canvas')).not.toBeVisible()
    expect(screen.getByAltText('')).toBeVisible()

    Object.defineProperty(motionQuery, 'matches', {
      configurable: true,
      value: false,
    })
    act(() => {
      mediaEvents.dispatchEvent(new Event('change'))
    })
    expect(frames.size).toBe(1)
  })

  it('stops scheduling frames while paused and resumes when the control is cleared', () => {
    const { rerender } = render(<BlackHoleBackground />)
    loadBackground()
    rerender(<BlackHoleBackground paused />)
    expect(frames.size).toBe(0)

    rerender(<BlackHoleBackground paused={false} />)
    expect(frames.size).toBe(1)
  })

  it('suspends animation while the page is hidden or the background is outside the viewport', () => {
    render(<BlackHoleBackground />)
    loadBackground()
    hidden = true
    fireEvent(document, new Event('visibilitychange'))
    expect(frames.size).toBe(0)

    setIntersection(false)
    hidden = false
    fireEvent(document, new Event('visibilitychange'))
    expect(frames.size).toBe(0)

    setIntersection(true)
    expect(frames.size).toBe(1)
  })

  it.each(['shader', 'texture'])(
    'retains the static image if %s setup fails',
    (failure) => {
      if (failure === 'shader') {
        context.getShaderParameter.mockReturnValue(false)
      }
      if (failure === 'texture') {
        context.texImage2D.mockImplementation(() => {
          throw new Error('Upload failed')
        })
      }
      const { container } = render(<BlackHoleBackground />)
      loadBackground()

      expect(container.querySelector('canvas')).not.toBeVisible()
      expect(screen.getByAltText('')).toBeVisible()
      expect(frames.size).toBe(0)
    }
  )

  it('keeps a failed image load from starting graphics work', () => {
    const { container } = render(<BlackHoleBackground />)
    fireEvent.error(screen.getByAltText(''))

    expect(container.querySelector('canvas')).not.toBeVisible()
    expect(frames.size).toBe(0)
    expect(context.drawArrays).not.toHaveBeenCalled()
  })

  it('resizes the drawing buffer without exceeding the device and width budgets', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const { container } = render(<BlackHoleBackground />)
    loadBackground()
    const canvas = container.querySelector('canvas')

    expect(canvas?.width).toBe(1600)
    expect(canvas?.height).toBe(1000)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 390,
      height: 844,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 390,
      bottom: 844,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))

    expect(canvas?.width).toBe(390)
    expect(canvas?.height).toBe(844)
    expect(frames.size).toBe(1)
  })

  it('restores the static image when the graphics context is lost', () => {
    const { container } = render(<BlackHoleBackground />)
    loadBackground()
    const canvas = container.querySelector('canvas')
    if (!canvas) throw new Error('Background canvas was not rendered')
    fireEvent(canvas, new Event('webglcontextlost'))

    expect(canvas).not.toBeVisible()
    expect(screen.getByAltText('')).toBeVisible()
    expect(frames.size).toBe(0)
  })

  it('releases GPU resources and stops work after unmount', () => {
    const { unmount } = render(<BlackHoleBackground />)
    loadBackground()
    unmount()

    expect(frames.size).toBe(0)
    expect(disconnectIntersection).toHaveBeenCalled()
    expect(context.deleteTexture).toHaveBeenCalled()
    expect(context.deleteBuffer).toHaveBeenCalled()
    expect(context.deleteProgram).toHaveBeenCalled()
    fireEvent(document, new Event('visibilitychange'))
    expect(frames.size).toBe(0)
  })
})
