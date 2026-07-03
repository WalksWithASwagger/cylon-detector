import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts/core'
import { TooltipComponent } from 'echarts/components'

echarts.use([TooltipComponent])

const MIN_SCALE = 1
const MAX_SCALE = 4
const BUTTON_STEP = 0.5
// Distance (px) a single finger must travel before we commit to "this is a
// drag" and swallow the resulting click. Below this, movement is treated as
// touch jitter on what's still a tap.
const PAN_MOVE_THRESHOLD = 10
// Even at 1x zoom, let people pan the view around a bit — panning shouldn't
// require zooming in first. Expressed as a fraction of the container size.
const BASELINE_PAN_RATIO = 0.3

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function touchMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

export class ChartContainer {
  private chart: echarts.ECharts | null = null
  private container: HTMLElement

  private zoomInBtn: HTMLButtonElement | null = null
  private zoomOutBtn: HTMLButtonElement | null = null

  private scale = MIN_SCALE
  private panX = 0
  private panY = 0

  // Pinch gesture state
  private pinchStartDistance = 0
  private pinchStartScale = MIN_SCALE
  private pinchAnchorLocalX = 0
  private pinchAnchorLocalY = 0
  private gestureCenterBaseX = 0
  private gestureCenterBaseY = 0

  // Single-finger pan state
  private panStartClientX = 0
  private panStartClientY = 0
  private panStartX = 0
  private panStartY = 0
  private isSingleTouchPanning = false

  // Set on any drag/pinch that actually moved content, so the resulting
  // synthetic click doesn't get misread as a tap-to-drill by the chart.
  private didPanOrPinch = false

  constructor(containerId: string) {
    const element = document.getElementById(containerId)
    if (!element) {
      throw new Error(`Container with id '${containerId}' not found`)
    }
    this.container = element
    this.setupZoomControls()
    this.setupPinchAndPan()
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }

  private clampPan(panX: number, panY: number, scale: number): { x: number; y: number } {
    const baselineX = this.container.clientWidth * BASELINE_PAN_RATIO
    const baselineY = this.container.clientHeight * BASELINE_PAN_RATIO
    const maxPanX = Math.max(baselineX, (this.container.clientWidth * (scale - 1)) / 2)
    const maxPanY = Math.max(baselineY, (this.container.clientHeight * (scale - 1)) / 2)
    return {
      x: this.clamp(panX, -maxPanX, maxPanX),
      y: this.clamp(panY, -maxPanY, maxPanY)
    }
  }

  private applyTransform(withTransition: boolean) {
    this.container.style.transition = withTransition ? 'transform 0.2s ease' : 'none'
    this.container.style.transform =
      this.scale === MIN_SCALE && this.panX === 0 && this.panY === 0
        ? ''
        : `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`

    if (this.zoomInBtn) this.zoomInBtn.disabled = this.scale >= MAX_SCALE
    if (this.zoomOutBtn) this.zoomOutBtn.disabled = this.scale <= MIN_SCALE
  }

  resetZoomPan() {
    this.scale = MIN_SCALE
    this.panX = 0
    this.panY = 0
    this.applyTransform(true)
  }

  private setupZoomControls() {
    this.zoomInBtn = document.getElementById('chart-zoom-in') as HTMLButtonElement | null
    this.zoomOutBtn = document.getElementById('chart-zoom-out') as HTMLButtonElement | null
    if (!this.zoomInBtn || !this.zoomOutBtn) return

    const setScale = (newScale: number) => {
      this.scale = this.clamp(newScale, MIN_SCALE, MAX_SCALE)
      const clamped = this.clampPan(this.panX, this.panY, this.scale)
      this.panX = clamped.x
      this.panY = clamped.y
      this.applyTransform(true)
    }

    this.zoomInBtn.addEventListener('click', () => setScale(this.scale + BUTTON_STEP))
    this.zoomOutBtn.addEventListener('click', () => setScale(this.scale - BUTTON_STEP))

    this.applyTransform(false)
  }

  // ECharts/zrender has a hardcoded ~4px mousedown-to-click distance check
  // (zrender's Handler.click), so any touch tap that drifts more than a few
  // pixels — extremely common on a real touchscreen — never fires
  // chart.on('click') at all, natively. We take over the touch->click
  // synthesis ourselves: preventDefault on touchstart suppresses the
  // browser's own compatibility mousedown/mouseup/click sequence, and for
  // gestures we've classified as a tap (see PAN_MOVE_THRESHOLD) we dispatch
  // a clean mousedown+mouseup+click ourselves, all at the same coordinate,
  // so zrender's distance check always passes regardless of finger jitter.
  private synthesizeClick(clientX: number, clientY: number) {
    const target = (document.elementFromPoint(clientX, clientY) as HTMLElement) || this.container
    const opts: MouseEventInit = { clientX, clientY, bubbles: true, cancelable: true, view: window }
    target.dispatchEvent(new MouseEvent('mousedown', opts))
    target.dispatchEvent(new MouseEvent('mouseup', opts))
    target.dispatchEvent(new MouseEvent('click', opts))
  }

  private setupPinchAndPan() {
    this.container.style.touchAction = 'none'

    this.container.addEventListener('touchstart', (e: TouchEvent) => {
      // Take over the whole gesture so the browser doesn't also generate its
      // own (jitter-sensitive) compatibility click alongside ours.
      e.preventDefault()
      this.applyTransform(false)
      if (e.touches.length === 2) {
        this.isSingleTouchPanning = false
        const [t1, t2] = [e.touches[0], e.touches[1]]
        this.pinchStartDistance = touchDistance(t1, t2)
        this.pinchStartScale = this.scale

        const rect = this.container.getBoundingClientRect()
        this.gestureCenterBaseX = rect.left + rect.width / 2 - this.panX
        this.gestureCenterBaseY = rect.top + rect.height / 2 - this.panY

        const mid = touchMidpoint(t1, t2)
        this.pinchAnchorLocalX = (mid.x - this.gestureCenterBaseX - this.panX) / this.scale
        this.pinchAnchorLocalY = (mid.y - this.gestureCenterBaseY - this.panY) / this.scale
      } else if (e.touches.length === 1) {
        this.isSingleTouchPanning = true
        this.panStartClientX = e.touches[0].clientX
        this.panStartClientY = e.touches[0].clientY
        this.panStartX = this.panX
        this.panStartY = this.panY
      }
    }, { passive: false })

    this.container.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 2 && this.pinchStartDistance > 0) {
        e.preventDefault()
        const [t1, t2] = [e.touches[0], e.touches[1]]
        const newScale = this.clamp(
          this.pinchStartScale * (touchDistance(t1, t2) / this.pinchStartDistance),
          MIN_SCALE,
          MAX_SCALE
        )
        const mid = touchMidpoint(t1, t2)
        const rawPanX = mid.x - this.gestureCenterBaseX - newScale * this.pinchAnchorLocalX
        const rawPanY = mid.y - this.gestureCenterBaseY - newScale * this.pinchAnchorLocalY
        const clamped = this.clampPan(rawPanX, rawPanY, newScale)

        this.scale = newScale
        this.panX = clamped.x
        this.panY = clamped.y
        this.didPanOrPinch = true
        this.applyTransform(false)
      } else if (e.touches.length === 1 && this.isSingleTouchPanning) {
        // Track and apply pan from the very first pixel of movement so a
        // deliberate drag feels immediate, not stuck behind a dead zone.
        // The distance threshold only decides whether the eventual click
        // gets swallowed (i.e. whether this was "really" a drag vs a tap).
        const dx = e.touches[0].clientX - this.panStartClientX
        const dy = e.touches[0].clientY - this.panStartClientY
        if (Math.hypot(dx, dy) > PAN_MOVE_THRESHOLD) {
          // Only once we've committed to "this is a drag" do we preventDefault.
          // Calling it unconditionally (even for 1-2px jitter) suppresses the
          // browser's synthetic click for what should still register as a tap.
          this.didPanOrPinch = true
          e.preventDefault()
        }
        const clamped = this.clampPan(this.panStartX + dx, this.panStartY + dy, this.scale)
        this.panX = clamped.x
        this.panY = clamped.y
        this.applyTransform(false)
      }
    }, { passive: false })

    this.container.addEventListener('touchend', () => {
      const wasTap = this.isSingleTouchPanning && !this.didPanOrPinch
      const tapX = this.panStartClientX
      const tapY = this.panStartClientY

      if (wasTap) {
        // Movement never crossed the drag threshold — snap back so a
        // jittery finger doesn't leave a stray few-pixel pan offset behind.
        this.panX = this.panStartX
        this.panY = this.panStartY
      }
      this.isSingleTouchPanning = false
      this.pinchStartDistance = 0
      this.applyTransform(true)

      if (wasTap) {
        this.synthesizeClick(tapX, tapY)
      }
    })

    this.container.addEventListener('touchcancel', () => {
      this.isSingleTouchPanning = false
      this.pinchStartDistance = 0
      this.applyTransform(true)
    })

    // A pan/pinch that just ended still fires a synthetic click on release.
    // Swallow that one click before it reaches ECharts' own listener so a
    // drag doesn't get misread as a tap-to-drill.
    this.container.addEventListener('click', (e: MouseEvent) => {
      if (this.didPanOrPinch) {
        this.didPanOrPinch = false
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }, { capture: true })
  }

  init(renderer: 'canvas' | 'svg' = 'svg', theme: string = 'dark') {
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      console.warn('ChartContainer: Container has zero dimensions, waiting for layout...')
      this.container.style.width = '100%'
      this.container.style.height = '100%'
      
      requestAnimationFrame(() => {
        this.init(renderer, theme)
      })
      return
    }
    
    try {
      this.chart = echarts.init(this.container, theme, {
        renderer
      })
      
      const loader = document.getElementById('chart-loader')
      if (loader) {
        loader.style.display = 'none'
      }
      
      window.addEventListener('resize', () => {
        this.chart?.resize()
      })
    } catch (error) {
      console.error('Failed to initialize ECharts:', error)
      const loader = document.getElementById('chart-loader')
      if (loader) {
        loader.style.display = 'none'
      }
      throw error
    }
  }

  setOption(option: EChartsOption, notMerge = false) {
    if (this.chart) {
      this.chart.setOption(option, notMerge)
    }
  }

  refreshData() {
    if (this.chart) {
      this.chart.setOption(this.chart.getOption(), true)
    }
  }

  getChart(): echarts.ECharts | null {
    return this.chart
  }

  resize() {
    this.chart?.resize()
  }

  destroy() {
    this.chart?.dispose()
    this.chart = null
  }
}
