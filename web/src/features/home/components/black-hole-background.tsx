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
import { useEffect, useRef } from 'react'

import '@/styles/black-hole-background.css'

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

// Advect gas along the projected accretion disk, with the front moving right
// and the back moving left. Short, overlapping texture passes keep the
// photograph's illumination and lensed silhouette fixed during a full orbit.
const FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform vec2 u_image_size;
  uniform float u_rotation;
  varying vec2 v_uv;

  vec3 imageAt(vec2 point) {
    return texture2D(u_image, clamp(point, 0.001, 0.999)).rgb;
  }

  vec3 localBlur(vec2 point, vec2 texel, vec3 color) {
    vec2 step = texel * 12.0;
    return (
      color * 4.0 +
      imageAt(point + vec2(step.x, 0.0)) +
      imageAt(point - vec2(step.x, 0.0)) +
      imageAt(point + vec2(0.0, step.y)) +
      imageAt(point - vec2(0.0, step.y))
    ) / 8.0;
  }

  vec2 orbitalSource(vec2 orbit, float squash, float phase, vec2 major, vec2 minor) {
    float angle = (phase - 0.5) * 0.34906585;
    float cosine = cos(angle);
    float sine = sin(angle);
    vec2 source = vec2(
      cosine * orbit.x + sine * orbit.y,
      -sine * orbit.x + cosine * orbit.y
    );
    vec2 projected = major * source.x + minor * source.y * squash;
    return vec2(0.414, 0.51) + projected / vec2(u_image_size.x / u_image_size.y, 1.0);
  }

  float materialContrast(vec2 point, vec2 texel) {
    vec3 color = imageAt(point);
    vec3 blurred = localBlur(point, texel, color);
    vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
    float contrast = dot(color, luminance) / max(dot(blurred, luminance), 0.025);
    // Exclude isolated stars and the thin photon rim from the moving material.
    float gas = smoothstep(0.025, 0.12, blurred.r - blurred.b);
    return mix(1.0, clamp(contrast, 0.35, 1.8), gas);
  }

  void main() {
    float cover = max(u_resolution.x / u_image_size.x, u_resolution.y / u_image_size.y);
    vec2 visible = u_resolution / (u_image_size * cover);
    vec2 uv = v_uv * visible + (1.0 - visible) * vec2(0.43, 0.5);
    vec3 base = imageAt(uv);

    float aspect = u_image_size.x / u_image_size.y;
    vec2 center = vec2(0.414, 0.51);
    vec2 offset = (uv - center) * vec2(aspect, 1.0);

    // Texture upload flips Y: the equator slopes down toward the right.
    vec2 major = normalize(vec2(0.970, -0.243));
    vec2 minor = vec2(-major.y, major.x);
    vec2 plane = vec2(dot(offset, major), dot(offset, minor));

    // Deproject the inclined disk before rotating about its normal. The
    // lensed arcs above and below the core are more open than the disk plane.
    float lens = smoothstep(0.10, 0.20, abs(plane.y)) *
      (1.0 - smoothstep(0.28, 0.42, abs(plane.x)));
    float squash = mix(0.28, 0.90, lens);
    vec2 orbit = vec2(plane.x, plane.y / squash);

    // Each pass advances in one direction. Fade it out before resetting its
    // small texture offset, so dark regions never sweep across the disk.
    float phase = fract(u_rotation * 18.0 / 6.28318530718);
    float secondPhase = fract(phase + 0.5);
    vec2 texel = 1.0 / u_image_size;
    float first = materialContrast(orbitalSource(orbit, squash, phase, major, minor), texel);
    float second = materialContrast(orbitalSource(orbit, squash, secondPhase, major, minor), texel);
    float contrast = mix(first, second, abs(phase * 2.0 - 1.0));

    vec3 baseBlur = localBlur(uv, texel, base);
    vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
    float lighting = dot(baseBlur, luminance);
    float material = lighting * contrast / max(dot(base, luminance), 0.025);
    float radialMask = 1.0 - smoothstep(0.64, 0.78, length(plane));
    float gas = smoothstep(0.025, 0.16, baseBlur.r - baseBlur.b);
    float warmth = smoothstep(0.04, 0.18, base.r - base.b);
    // Transfer luminance only: subtracting RGB detail introduces blue fringes.
    vec3 result = base * mix(1.0, clamp(material, 0.45, 1.8), radialMask * gas * warmth);
    gl_FragColor = vec4(result, 1.0);
  }
`

const ROTATION_PERIOD_SECONDS = 180

interface BlackHoleBackgroundProps {
  paused?: boolean
}

export function BlackHoleBackground(props: BlackHoleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(false)
  const syncMotionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    pausedRef.current = props.paused ?? false
    syncMotionRef.current?.()
  }, [props.paused])

  useEffect(() => {
    const container = containerRef.current
    const image = imageRef.current
    const canvas = canvasRef.current
    if (!container || !image || !canvas) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let texture: WebGLTexture | null = null
    const shaders: WebGLShader[] = []
    let rotationUniform: WebGLUniformLocation | null = null
    let resolutionUniform: WebGLUniformLocation | null = null
    let frame: number | null = null
    let previousTime: number | null = null
    let elapsed = 0
    let ready = false
    let failed = false
    let inViewport = true
    let imageLoaded = image.complete && image.naturalWidth > 0

    const releaseResources = () => {
      if (!gl) return
      if (texture) gl.deleteTexture(texture)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
      for (const shader of shaders) gl.deleteShader(shader)
      shaders.length = 0
      texture = null
      buffer = null
      program = null
      ready = false
    }

    const showFallback = () => {
      failed = true
      canvas.hidden = true
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      releaseResources()
    }

    const draw = () => {
      if (!gl || !ready) return
      gl.uniform1f(
        rotationUniform,
        ((elapsed % ROTATION_PERIOD_SECONDS) / ROTATION_PERIOD_SECONDS) *
          Math.PI *
          2
      )
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const resize = () => {
      if (!gl || !ready) return
      const bounds = container.getBoundingClientRect()
      const width = Math.max(1, bounds.width)
      const height = Math.max(1, bounds.height)
      // A decorative scene does not need a retina-sized drawing buffer.
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        width < 768 ? 1 : 1.5,
        1600 / width
      )
      canvas.width = Math.max(1, Math.round(width * pixelRatio))
      canvas.height = Math.max(1, Math.round(height * pixelRatio))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height)
      draw()
    }

    const initializeRenderer = () => {
      try {
        gl = canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'low-power',
        })
        if (!gl) return showFallback()
        program = gl.createProgram()
        buffer = gl.createBuffer()
        texture = gl.createTexture()
        if (!program || !buffer || !texture) return showFallback()

        for (const [type, source] of [
          [gl.VERTEX_SHADER, VERTEX_SHADER],
          [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
        ] as const) {
          const shader = gl.createShader(type)
          if (!shader) return showFallback()
          shaders.push(shader)
          gl.shaderSource(shader, source)
          gl.compileShader(shader)
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            return showFallback()
          }
          gl.attachShader(program, shader)
        }
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          return showFallback()
        }
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW
        )
        const position = gl.getAttribLocation(program, 'a_position')
        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image
        )
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
        gl.uniform2f(
          gl.getUniformLocation(program, 'u_image_size'),
          image.naturalWidth,
          image.naturalHeight
        )
        rotationUniform = gl.getUniformLocation(program, 'u_rotation')
        resolutionUniform = gl.getUniformLocation(program, 'u_resolution')
        ready = true
        resize()
      } catch {
        showFallback()
      }
    }

    const animate = (now: number) => {
      if (previousTime === null || now - previousTime >= 1000 / 30) {
        if (previousTime !== null) {
          elapsed += Math.min(now - previousTime, 100) / 1000
        }
        previousTime = now
        draw()
      }
      frame = window.requestAnimationFrame(animate)
    }

    const syncMotion = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      previousTime = null
      if (motionQuery.matches) {
        canvas.hidden = true
        return
      }
      if (
        failed ||
        !imageLoaded ||
        pausedRef.current ||
        document.hidden ||
        !inViewport
      ) {
        return
      }
      if (!ready) initializeRenderer()
      if (!ready) return
      canvas.hidden = false
      frame = window.requestAnimationFrame(animate)
    }

    const onImageLoad = () => {
      imageLoaded = image.naturalWidth > 0
      syncMotion()
    }
    const intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            inViewport = entry?.isIntersecting ?? false
            syncMotion()
          })
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)

    syncMotionRef.current = syncMotion
    image.addEventListener('load', onImageLoad)
    image.addEventListener('error', showFallback)
    canvas.addEventListener('webglcontextlost', showFallback)
    document.addEventListener('visibilitychange', syncMotion)
    motionQuery.addEventListener('change', syncMotion)
    window.addEventListener('resize', resize)
    intersectionObserver?.observe(container)
    resizeObserver?.observe(container)
    syncMotion()

    return () => {
      syncMotionRef.current = null
      if (frame !== null) window.cancelAnimationFrame(frame)
      image.removeEventListener('load', onImageLoad)
      image.removeEventListener('error', showFallback)
      canvas.removeEventListener('webglcontextlost', showFallback)
      document.removeEventListener('visibilitychange', syncMotion)
      motionQuery.removeEventListener('change', syncMotion)
      window.removeEventListener('resize', resize)
      intersectionObserver?.disconnect()
      resizeObserver?.disconnect()
      releaseResources()
      canvas.hidden = true
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className='black-hole-background'
      aria-hidden='true'
    >
      <img
        ref={imageRef}
        className='black-hole-background-image'
        src='/images/home/event-horizon.webp'
        alt=''
        draggable={false}
        fetchPriority='high'
      />
      <canvas ref={canvasRef} className='black-hole-background-canvas' hidden />
    </div>
  )
}
