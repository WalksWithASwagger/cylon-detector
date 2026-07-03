export interface LevelBarItem {
  name: string
  label: string
  hasChildren: boolean
}

interface ChartLevelBarHandlers {
  onSelect: (name: string) => void
  onBack: () => void
}

export class ChartLevelBar {
  private container: HTMLElement
  private handlers: ChartLevelBarHandlers
  private pillLabel!: HTMLElement
  private sheetHeaderLabel!: HTMLElement
  private sheet!: HTMLElement
  private backdrop!: HTMLElement
  private pill!: HTMLButtonElement
  private items: LevelBarItem[] = []
  private showBack = false
  private isOpen = false

  constructor(containerId: string, handlers: ChartLevelBarHandlers) {
    const element = document.getElementById(containerId)
    if (!element) {
      throw new Error(`Container with id '${containerId}' not found`)
    }
    this.container = element
    this.handlers = handlers
    this.render()
  }

  setState(label: string, showBack: boolean, items: LevelBarItem[]) {
    this.pillLabel.textContent = label
    this.sheetHeaderLabel.textContent = label
    this.showBack = showBack
    this.items = items
    this.renderSheetContent()
  }

  close() {
    this.setOpen(false)
  }

  private render() {
    this.container.innerHTML = `
      <div class="chart-level-backdrop"></div>
      <div class="chart-level-sheet">
        <button type="button" class="chart-level-sheet-header">
          <div class="chart-level-sheet-handle"></div>
          <span class="chart-level-sheet-header-label"></span>
        </button>
        <div class="chart-level-sheet-list"></div>
      </div>
      <button type="button" class="chart-level-pill">
        <span class="chart-level-pill-label">Overview</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>
    `

    this.backdrop = this.container.querySelector('.chart-level-backdrop') as HTMLElement
    this.sheet = this.container.querySelector('.chart-level-sheet') as HTMLElement
    this.pill = this.container.querySelector('.chart-level-pill') as HTMLButtonElement
    this.pillLabel = this.container.querySelector('.chart-level-pill-label') as HTMLElement
    this.sheetHeaderLabel = this.container.querySelector('.chart-level-sheet-header-label') as HTMLElement

    this.pill.addEventListener('click', () => this.setOpen(!this.isOpen))
    this.backdrop.addEventListener('click', () => this.setOpen(false))
    this.sheet.querySelector('.chart-level-sheet-header')?.addEventListener('click', () => this.setOpen(false))
  }

  private setOpen(open: boolean) {
    this.isOpen = open
    this.container.classList.toggle('open', open)
    this.pill.classList.toggle('open', open)
  }

  private renderSheetContent() {
    const list = this.sheet.querySelector('.chart-level-sheet-list') as HTMLElement
    const backRow = this.showBack
      ? `<button type="button" class="chart-level-item chart-level-item-back" data-action="back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>`
      : ''

    const itemRows = this.items
      .map(
        (item) => `<button type="button" class="chart-level-item" data-name="${item.name}">
          <span>${item.label}</span>
          ${item.hasChildren ? '<span class="chart-level-item-chevron">›</span>' : ''}
        </button>`
      )
      .join('')

    list.innerHTML = backRow + itemRows

    list.querySelectorAll<HTMLButtonElement>('.chart-level-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setOpen(false)
        if (btn.dataset.action === 'back') {
          this.handlers.onBack()
        } else if (btn.dataset.name) {
          this.handlers.onSelect(btn.dataset.name)
        }
      })
    })
  }
}
