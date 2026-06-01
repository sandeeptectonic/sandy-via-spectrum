/**
 * Featured Collection snippet-author runtime.
 *
 * Responsibilities:
 *   1. Variant-resolution binding — `applyVariant` patches the cheap fields
 *      (heading text, description, alignment class, cards-per-row CSS var)
 *      every time the runtime SDK fires `$spectrum:variant_resolved`.
 *   2. Page-level carousel wiring — when `data-layout="carousel"` is on the
 *      layout wrapper, attach arrow / dot handlers and keep the active
 *      progress indicator (dots / scroll-bar thumb / stepper) in sync with
 *      scroll position.
 *   3. Per-card image carousel wiring — when image_mode is carousel, each
 *      card's image-zone holds a scroll-snap row; JS updates the dots'
 *      active state on scroll.
 *   4. ATC click handlers + Mini-PDP variant dialog. Single-variant ATC
 *      adds instantly; multi-variant opens the dialog. Cart-add forwards
 *      `sections` and dispatches `cart:update` so the merchant theme's
 *      drawer / bubble refresh without a page reload.
 *
 * Container-scoped: every DOM read/write goes through `node`; multi-render
 * pages cannot collide.
 */
;(() => {
  const SNIPPET_ID = 'tcm9wosw'
  const FEATURE_SLUG = 'tab_collection_product_list'
  const ROOT_SELECTOR = `.sai-${SNIPPET_ID}`
  const HEADING_SELECTOR = `.sai-${SNIPPET_ID}__heading-text`
  const DESCRIPTION_SELECTOR = `.sai-${SNIPPET_ID}__description`
  const LAYOUT_SELECTOR = `.sai-${SNIPPET_ID}__layout`
  const GRID_SELECTOR = `.sai-${SNIPPET_ID}__grid`
  const CARD_SELECTOR = `.sai-${SNIPPET_ID}__card`
  const ARROW_SELECTOR = '[data-spectrum-carousel-arrow]'
  const DOT_SELECTOR = '[data-spectrum-carousel-dot]'
  const THUMB_SELECTOR = '[data-spectrum-carousel-thumb]'
  const STEPPER_SELECTOR = '[data-spectrum-carousel-stepper]'
  const CPR_VAR_M = `--sai-${SNIPPET_ID}-cpr-m`
  const CPR_VAR_T = `--sai-${SNIPPET_ID}-cpr-t`
  const CPR_VAR_D = `--sai-${SNIPPET_ID}-cpr-d`
  const CPR_MIN = 1
  const CPR_MAX = 6
  const CPR_DEFAULT_M = 2
  const CPR_DEFAULT_T = 3
  const CPR_DEFAULT_D = 4
  // Minimum on-screen time for the ATC/Buy Now spinner so cart writes that
  // resolve in <100ms don't flash the loader imperceptibly before the modal
  // closes / the navigation fires.
  const MIN_SPINNER_MS = 350

  function noopTrack() {}

  // Wrap track so a malformed payload or downstream throw can never break a
  // cart-add / modal-open flow. Telemetry is observational — surface the
  // failure in DevTools but keep the user's action moving.
  function safeTrack(track) {
    return (name, payload) => {
      try {
        track(name, payload)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[${FEATURE_SLUG}] analytics dispatch failed`, name, err)
      }
    }
  }

  // Card-link href is the canonical product URL; derive the handle from the
  // path so analytics doesn't need a separate data attribute on every card.
  // Returns null when the URL is missing or unparseable — null is a valid
  // payload value per the analytics catalog.
  function productHandleFromUrl(url) {
    if (typeof url !== 'string') return null
    const m = url.match(/\/products\/([^/?#]+)/)
    return m?.[1] ? m[1] : null
  }

  // Share a product URL via the Web Share API where available, falling
  // back to clipboard copy. Returns the method used so analytics can
  // distinguish the two paths. Identical helper lives in the Mini-PDP
  // share button; this version is reused from the primary-CTA share
  // action so we don't fork two copies of the same logic.
  async function shareProductUrl({ title, url }) {
    const data = { title: title ?? '', url }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
        return 'web_share'
      } catch {
        // user cancelled or permission denied — fall through to clipboard
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        return 'clipboard'
      } catch {}
    }
    return 'unsupported'
  }

  // Walk a card to its 0-indexed position within the rendered grid. Used by
  // every event payload so PostHog can correlate cart-adds with where in
  // the list the merchandise was discovered.
  function cardPosition(cardEl) {
    if (!cardEl || !cardEl.parentElement) return null
    const siblings = cardEl.parentElement.querySelectorAll(`:scope > ${CARD_SELECTOR}`)
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i] === cardEl) return i
    }
    return null
  }

  // Clamp a single sub-value. Falls back to the per-viewport default when the
  // input is missing / non-numeric — matches the Liquid cascade in
  // `_sai-snippet-tcm9wosw.liquid` so client variant-swap and SSR agree.
  function clampCpr(value, fallback) {
    const n = typeof value === 'number' ? value : Number.parseFloat(value)
    if (!Number.isFinite(n)) return fallback
    if (n < CPR_MIN) return CPR_MIN
    if (n > CPR_MAX) return CPR_MAX
    return n
  }

  // Resolve the responsive-number value into three clamped sub-values, with
  // the same mobile-first cascade the Liquid template uses (tablet inherits
  // mobile, desktop inherits tablet). Accepts the structured object plus a
  // legacy plain number for safety against stale data.
  function resolveCardsPerRow(value) {
    if (typeof value === 'number') {
      const n = clampCpr(value, CPR_DEFAULT_M)
      return { mobile: n, tablet: n, desktop: n }
    }
    const obj = value && typeof value === 'object' ? value : {}
    const mobile = clampCpr(obj.mobile, CPR_DEFAULT_M)
    const tablet =
      obj.tablet === undefined || obj.tablet === null ? mobile : clampCpr(obj.tablet, CPR_DEFAULT_T)
    const desktop =
      obj.desktop === undefined || obj.desktop === null
        ? tablet
        : clampCpr(obj.desktop, CPR_DEFAULT_D)
    return { mobile, tablet, desktop }
  }

  function setText(node, selector, text) {
    const el = node.querySelector(selector)
    if (!el) return
    el.textContent = typeof text === 'string' ? text : ''
  }

  function applyVariant(node, content) {
    const root = node.querySelector(ROOT_SELECTOR)
    if (!root) return

    if ('heading' in content) setText(node, HEADING_SELECTOR, content.heading)
    if ('description' in content) setText(node, DESCRIPTION_SELECTOR, content.description)

    const grid = node.querySelector(GRID_SELECTOR)
    if (grid && 'cards_per_row' in content) {
      const { mobile, tablet, desktop } = resolveCardsPerRow(content.cards_per_row)
      // Mirror the Liquid contract: carousel CSS uses calc() (fractional safe);
      // grid CSS uses grid-template-columns: repeat() which rejects fractional.
      // Floor everywhere except carousel so a stale 1.5 in grid mode doesn't
      // blank the layout.
      const layoutEl = node.querySelector(LAYOUT_SELECTOR)
      const isCarousel = layoutEl?.dataset.layout === 'carousel'
      const m = isCarousel ? mobile : Math.floor(mobile)
      const t = isCarousel ? tablet : Math.floor(tablet)
      const d = isCarousel ? desktop : Math.floor(desktop)
      grid.style.setProperty(CPR_VAR_M, String(m))
      grid.style.setProperty(CPR_VAR_T, String(t))
      grid.style.setProperty(CPR_VAR_D, String(d))
    }
  }

  // ── Page-level carousel ─────────────────────────────────────
  function currentIndexFor(scrollLeft, cardStride, cardCount) {
    if (cardStride <= 0) return 0
    const i = Math.round(scrollLeft / cardStride)
    if (i < 0) return 0
    if (i > cardCount - 1) return cardCount - 1
    return i
  }

  function readGap(grid) {
    const raw = window.getComputedStyle(grid).columnGap || window.getComputedStyle(grid).gap
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  function initCarousel(node) {
    const layout = node.querySelector(LAYOUT_SELECTOR)
    if (!layout || layout.dataset.layout !== 'carousel') return

    const grid = layout.querySelector(GRID_SELECTOR)
    const cards = grid ? Array.from(grid.querySelectorAll(`:scope > ${CARD_SELECTOR}`)) : []
    if (!grid || cards.length === 0) return

    const arrows = layout.querySelectorAll(ARROW_SELECTOR)
    const dots = Array.from(layout.querySelectorAll(DOT_SELECTOR))
    const thumb = layout.querySelector(THUMB_SELECTOR)
    const stepper = layout.querySelector(STEPPER_SELECTOR)

    function getStride() {
      const card = cards[0]
      if (!card) return 0
      return card.getBoundingClientRect().width + readGap(grid)
    }

    // Indicator dots / stepper / arrows page by *visible-cards-per-row*, not
    // by raw card count. When 3 cards fit per viewport the indicator shows
    // ceil(cards/3) entries — clicking one advances by a whole page. The
    // page size is recomputed on every update() because cards-per-row is
    // responsive and the iframe can resize without a window resize event.
    function getPageSize(stride) {
      if (!stride || stride <= 0) return 1
      return Math.max(1, Math.round(grid.clientWidth / stride))
    }

    function update() {
      const stride = getStride()
      const pageSize = getPageSize(stride)
      const totalPages = Math.max(1, Math.ceil(cards.length / pageSize))
      const cardIdx = currentIndexFor(grid.scrollLeft, stride, cards.length)
      const activePage = Math.min(totalPages - 1, Math.floor(cardIdx / pageSize))
      const max = grid.scrollWidth - grid.clientWidth
      // Snap-aware rightmost reachable scrollLeft. With `scroll-snap-stop:
      // always` and uniform card widths + gap, the carousel can't park
      // past `floor(max / stride) * stride` — i.e. the largest multiple
      // of stride still inside the scroll range. Using the pixel `max`
      // as the denominator would leave the thumb mid-track at the last
      // slide because snap prevents `scrollLeft` from reaching it.
      const lastReachableIdx = stride > 0 ? Math.floor((max + 0.5) / stride) : 0
      const lastSnap = lastReachableIdx * stride
      const reachableMax = lastSnap > 0 ? lastSnap : max

      for (const [i, dot] of dots.entries()) {
        const visible = i < totalPages
        dot.hidden = !visible
        const active = visible && i === activePage
        dot.classList.toggle('is-active', active)
        if (active) dot.setAttribute('aria-selected', 'true')
        else dot.removeAttribute('aria-selected')
      }

      if (thumb && grid.scrollWidth > 0) {
        // Pixel-based thumb sizing + position with the correct
        // `translateX(%)` resolution (relative to the element's own
        // width). Width = the visible fraction of total content
        // (clientWidth / scrollWidth). Position = scroll progress
        // against the snap-aware reachable max. The translate %
        // is then re-projected from `% of track` to `% of thumb width`
        // so the thumb's right edge lands flush at the right of the
        // track on the last reachable scroll position — regardless of
        // page-size rounding.
        const visiblePct = (grid.clientWidth / grid.scrollWidth) * 100
        const widthPct = Math.max(visiblePct, 5)
        const progress = reachableMax > 0 ? Math.min(1, grid.scrollLeft / reachableMax) : 0
        const leftPctOfTrack = progress * (100 - widthPct)
        const translatePctOfOwnWidth = widthPct > 0 ? (leftPctOfTrack / widthPct) * 100 : 0
        thumb.style.width = `${widthPct}%`
        thumb.style.transform = `translateX(${translatePctOfOwnWidth}%)`
      }

      if (stepper) stepper.textContent = `${activePage + 1} / ${totalPages}`

      for (const arrow of arrows) {
        const dir = arrow.dataset.spectrumCarouselArrow
        const atStart = grid.scrollLeft <= 1
        const atEnd = grid.scrollLeft >= reachableMax - 1
        arrow.disabled = (dir === 'prev' && atStart) || (dir === 'next' && atEnd)
      }
    }

    for (const arrow of arrows) {
      arrow.addEventListener('click', () => {
        const stride = getStride()
        const pageSize = getPageSize(stride)
        const dir = arrow.dataset.spectrumCarouselArrow === 'prev' ? -1 : 1
        grid.scrollBy({ left: dir * stride * pageSize, behavior: 'smooth' })
      })
    }

    for (const [i, dot] of dots.entries()) {
      dot.addEventListener('click', () => {
        const stride = getStride()
        const pageSize = getPageSize(stride)
        grid.scrollTo({ left: i * stride * pageSize, behavior: 'smooth' })
      })
    }

    grid.addEventListener('scroll', update, { passive: true })
    // ResizeObserver catches the display:none → visible transition that
    // happens when the experience's visibility gate flips on. A plain
    // `resize` listener fires on viewport changes only — it misses the
    // initial render, when card widths first become measurable and the
    // page count needs to recompute.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update())
      ro.observe(grid)
    } else {
      window.addEventListener('resize', update)
    }
    update()
  }

  // ── Mini-PDP runtime ───────────────────────────────────────
  /**
   * Read the per-card payload Liquid emitted as a sibling of the CTA.
   *
   * Shape: { productId, title, url, description, images[],
   *          variants: [{ id, title, available, price, compareAtPrice,
   *                       inventoryQuantity }] }
   *
   * Legacy shape (array of variant rows) is tolerated so older instances
   * keep working.
   */
  function readPayloadForProduct(node, productId) {
    const tag = node.querySelector(`script[data-spectrum-atc-data="${productId}"]`)
    if (!tag) return null
    try {
      const parsed = JSON.parse(tag.textContent || '{}')
      if (Array.isArray(parsed)) return { variants: parsed }
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  function discountPercent(price, compareAt) {
    const numPrice = Number.parseFloat(String(price ?? '').replace(/[^0-9.-]/g, ''))
    const numCompare = Number.parseFloat(String(compareAt ?? '').replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(numPrice) || !Number.isFinite(numCompare)) return null
    if (numCompare <= 0 || numCompare <= numPrice) return null
    return Math.round(((numCompare - numPrice) / numCompare) * 100)
  }

  function formatDiscount(price, compareAt, format) {
    if (format === 'amount') {
      const numPrice = Number.parseFloat(String(price ?? '').replace(/[^0-9.-]/g, ''))
      const numCompare = Number.parseFloat(String(compareAt ?? '').replace(/[^0-9.-]/g, ''))
      if (!Number.isFinite(numPrice) || !Number.isFinite(numCompare)) return null
      const diff = numCompare - numPrice
      if (!Number.isFinite(diff) || diff <= 0) return null
      const prefixMatch = String(compareAt ?? '').match(/^[^0-9-]+/)
      const prefix = prefixMatch ? prefixMatch[0].trim() : ''
      const amountStr = Math.round(diff).toLocaleString()
      return prefix ? `SAVE ${prefix}${amountStr}` : `SAVE ${amountStr}`
    }
    const pct = discountPercent(price, compareAt)
    return pct === null || pct <= 0 ? null : `${pct}% OFF`
  }

  // ─── Cart-refresh helpers ──────────────────────────────────────────────
  //
  // The snippet-library convention is "all DOM ops scoped to container —
  // never query outside it." The four helpers below (`discoverCartSectionIds`,
  // `applyCartSectionUpdates`, `refreshCartCountBadges`, `notifyCartUpdate`)
  // intentionally query `document` globally. Their job is to drive theme-
  // owned cart UI — the cart drawer, the cart-count bubble in the header,
  // the standalone cart-items section — all of which live OUTSIDE any
  // snippet container by design. A scoped query would be functionally
  // wrong: we'd never find the merchant's cart components.
  //
  // Reviewers: do not refactor these to `node.querySelectorAll(...)`. The
  // global query is the contract; the scoped rule is the rule for everything
  // *else* in this file.

  // Standard section file handles used by Dawn-family OS 2.0 themes
  // (Dawn, Horizon, Ultra, etc.) for the cart bubble + drawer +
  // notification. Shopify wraps each rendered section in
  // `<div id="shopify-section-<handle>">`, so even themes that don't
  // tag their elements with `data-section-id` are still hittable via
  // that standard wrapper id. We request these handles unconditionally
  // — `/cart/add.js` ignores unknown ones, so the overhead is just a
  // few wasted bytes on themes that don't render some of them.
  const COMMON_CART_SECTION_HANDLES = [
    'cart-drawer',
    'cart-icon-bubble',
    'cart-notification',
    'cart-items',
    'cart-bubble',
    'cart-icon',
    'header',
  ]

  /**
   * Discover the section IDs the theme expects in the section-rendering
   * payload.  Modern Shopify themes (Horizon, Dawn-derived, etc.) tag
   * their cart drawers, cart icons, and bubble counts with
   * `data-section-id="…"`.  We forward all discovered IDs to
   * `/cart/add.js?sections=…` so the response includes the rerendered
   * HTML for each — which `applyCartSectionUpdates` then swaps into the
   * DOM directly (so themes that don't listen for our events still
   * update).  Also unions in any standard `#shopify-section-<handle>`
   * wrappers we find, so themes that don't tag with `data-section-id`
   * still get refreshed. Returns a comma-joined string or `null` when
   * no cart components are present.
   */
  function discoverCartSectionIds() {
    const seen = new Set()
    const elements = document.querySelectorAll(
      'cart-items-component[data-section-id],' +
        ' cart-drawer-component[data-section-id],' +
        ' cart-icon-component[data-section-id],' +
        ' cart-bubble-component[data-section-id],' +
        ' cart-notification[data-section-id],' +
        ' cart-count-bubble[data-section-id],' +
        ' [data-cart-items-section-id],' +
        ' [data-cart-drawer-section-id],' +
        ' [data-section-id^="cart"],' +
        ' [data-section-id$="cart"],' +
        ' [data-section-id*="cart-icon"],' +
        ' [data-section-id*="cart-drawer"],' +
        ' [data-section-id*="cart-bubble"]',
    )
    for (const el of elements) {
      const id =
        el.dataset?.sectionId ??
        el.getAttribute?.('data-cart-items-section-id') ??
        el.getAttribute?.('data-cart-drawer-section-id')
      if (id) seen.add(id)
    }
    for (const handle of COMMON_CART_SECTION_HANDLES) {
      if (document.getElementById(`shopify-section-${handle}`)) {
        seen.add(handle)
      }
    }
    if (seen.size === 0) return null
    return Array.from(seen).join(',')
  }

  /**
   * Swap the rendered cart-section HTML from a successful `/cart/add.js`
   * response into the live DOM.  For each `{ sectionId: html }` pair we
   * find every `[data-section-id="<id>"]` element, parse the returned
   * HTML, locate the matching source element, and replace `innerHTML`
   * (preserving the host custom element + its event listeners).  This is
   * the path that updates cart-bubble counts and cart-drawer contents
   * without a page reload on themes that don't listen to our events.
   */
  function applyCartSectionUpdates(sectionsHtml) {
    if (!sectionsHtml || typeof sectionsHtml !== 'object') return
    const parser = new DOMParser()
    for (const [sectionId, html] of Object.entries(sectionsHtml)) {
      if (typeof html !== 'string' || !html) continue
      // Two host selectors per section id: `[data-section-id="..."]`
      // (Dawn-family elements that tag themselves) AND
      // `#shopify-section-<handle>` (Shopify's standard wrapper around
      // any section file — works for themes that don't add the
      // data-section-id attribute, like Ultra).
      const escapedId = CSS.escape(sectionId)
      const targets = document.querySelectorAll(
        `[data-section-id="${escapedId}"], #shopify-section-${escapedId}`,
      )
      if (targets.length === 0) continue
      const doc = parser.parseFromString(html, 'text/html')
      const source =
        doc.querySelector(`[data-section-id="${escapedId}"]`) ??
        doc.getElementById(`shopify-section-${sectionId}`) ??
        doc.body.firstElementChild
      if (!source) continue
      for (const target of targets) {
        target.innerHTML = source.innerHTML
      }
    }
  }

  /**
   * Best-effort cart-count refresh for themes whose cart-count badge
   * sits outside any `data-section-id` element (so the section-update
   * path doesn't touch it).  We re-fetch the cart and overwrite the
   * `textContent` of common count-badge selectors with the fresh count.
   * Silent on themes that don't expose one of these selectors.
   */
  async function refreshCartCountBadges() {
    let count
    try {
      const sdk = window.Spectrum
      const cart =
        sdk?.cart?.get != null ? await sdk.cart.get() : await (await fetch('/cart.js')).json()
      count = cart?.item_count
    } catch {
      return
    }
    if (typeof count !== 'number') return
    const text = String(count)
    const selectors = [
      '[data-cart-count]',
      '[data-header-cart-count]',
      '[data-cart-item-count]',
      '.cart-count',
      '.cart-count-bubble',
      '.header__cart-count',
      'cart-count',
      'cart-count-bubble',
      '#cart-icon-bubble',
      '#cart-icon-bubble [aria-hidden="true"]',
      '.header__icon--cart .cart-count-bubble span:first-child',
    ]
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.querySelector(':scope > *')) continue
        el.textContent = text
      }
    }
  }

  /**
   * Tell the merchant theme the cart just changed.  First actively swaps
   * the rerendered section HTML into the DOM and refreshes count badges
   * outside any section host — then dispatches `cart:update` / `cart:added`
   * / `cart:refresh` for themes that listen.  Cart-bubble + drawer reflect
   * the new item without a page reload.
   */
  function notifyCartUpdate({ variantId, productId, response }) {
    const sections = response?.sections ?? {}

    applyCartSectionUpdates(sections)
    refreshCartCountBadges()

    const detail = {
      resource: response ?? {},
      sourceId: String(variantId),
      data: {
        source: 'spectrum-featured-collection',
        sections,
        itemCount: 1,
        productId: productId ?? undefined,
        variantId: String(variantId),
      },
    }
    // Theme dialects vary widely on event name + dispatch target — fire
    // every common name on both document and window so each merchant's
    // theme controller catches at least one.
    const eventNames = [
      'cart:update',
      'cart:updated',
      'cart:added',
      'cart:refresh',
      'cart:item-added',
      'cart:build',
      'cart:change',
      'theme:cart:change',
      'ajaxProduct:added',
      'on:cart:add',
      'liquid-ajax-cart:request-end',
    ]
    for (const name of eventNames) {
      try {
        document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))
        window.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))
      } catch {}
    }

    // Dawn / Horizon / Symmetry PubSub bus. Themes register their cart
    // controller with `subscribe(PUB_SUB_EVENTS.cartUpdate, ...)`; we
    // publish under both the constant name (when exposed) and the
    // string literal so older + newer Dawn forks both catch it.
    try {
      const pub = typeof window.publish === 'function' ? window.publish : null
      if (pub) {
        const topic = window.PUB_SUB_EVENTS?.cartUpdate ?? 'cart-update'
        pub(topic, { source: 'spectrum-snippet', cartData: response ?? {} })
        if (topic !== 'cart-update') pub('cart-update', { source: 'spectrum-snippet' })
      }
    } catch {}

    const candidates = document.querySelectorAll(
      'cart-drawer-component, cart-drawer, cart-notification, [data-cart-drawer], #cart-drawer',
    )
    for (const el of candidates) {
      if (typeof el.showDialog === 'function') {
        try {
          el.showDialog()
          return
        } catch {}
      }
      if (typeof el.open === 'function') {
        try {
          el.open()
          return
        } catch {}
      }
    }
    const toggle = document.querySelector('[data-cart-toggle], [data-action="open-cart"]')
    if (toggle && typeof toggle.click === 'function') {
      try {
        toggle.click()
      } catch {}
    }
  }

  async function addVariantToCart(variantId, quantity) {
    const sdk = window.Spectrum
    const sections = discoverCartSectionIds()
    const items = { id: variantId, quantity }
    if (sdk?.cart && typeof sdk.cart.add === 'function') {
      return sdk.cart.add(items, sections ? { sections } : undefined)
    }
    const fd = new FormData()
    fd.append('id', String(variantId))
    fd.append('quantity', String(quantity))
    if (sections) fd.append('sections', sections)
    const res = await fetch('/cart/add.js', { method: 'POST', body: fd })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cart add failed: ${res.status} ${text.slice(0, 200)}`)
    }
    return res.json().catch(() => ({}))
  }

  /**
   * Initialise the inline Mini-PDP modal scoped to this snippet container.
   *
   * On open, populates gallery / variants / price / qty / description from
   * the per-card payload.  Variant selection drives price-row + low-inventory
   * updates synchronously.
   *
   *   - ATC button: cart add + cart drawer notify (existing flow).
   *   - Buy Now: cart add + redirect to /checkout.
   *   - Share: native Web Share API; clipboard copy fallback.
   */
  function initMiniPdp(node, track) {
    const modal = node.querySelector('[data-spectrum-pdp-modal]')
    if (!modal) return null
    const trackFn = typeof track === 'function' ? track : noopTrack

    const cfgTag = modal.querySelector('[data-spectrum-pdp-config]')
    let cfg = {}
    try {
      cfg = JSON.parse(cfgTag?.textContent || '{}')
    } catch {}

    const backdrop = modal.querySelector('[data-spectrum-pdp-backdrop]')
    const closeBtn = modal.querySelector('[data-spectrum-pdp-close]')
    const trackEl = modal.querySelector('[data-spectrum-pdp-track]')
    const dotsEl = modal.querySelector('[data-spectrum-pdp-dots]')
    const chevronPrev = modal.querySelector('[data-spectrum-pdp-chevron="prev"]')
    const chevronNext = modal.querySelector('[data-spectrum-pdp-chevron="next"]')
    const titleEl = modal.querySelector('[data-spectrum-pdp-title]')
    const priceCurrentEl = modal.querySelector('[data-spectrum-pdp-price-current]')
    const priceMrpEl = modal.querySelector('[data-spectrum-pdp-price-mrp]')
    const discountEl = modal.querySelector('[data-spectrum-pdp-discount]')
    const variantsEl = modal.querySelector('[data-spectrum-pdp-variants]')
    const lowStockEl = modal.querySelector('[data-spectrum-pdp-low-stock]')
    const lowStockTextEl = modal.querySelector('[data-spectrum-pdp-low-stock-text]')
    const qtyInput = modal.querySelector('[data-spectrum-pdp-qty-input]')
    const qtyDec = modal.querySelector('[data-spectrum-pdp-qty-decrement]')
    const qtyInc = modal.querySelector('[data-spectrum-pdp-qty-increment]')
    const descEl = modal.querySelector('[data-spectrum-pdp-description]')
    const descBody = modal.querySelector('[data-spectrum-pdp-description-body]')
    const descToggle = modal.querySelector('[data-spectrum-pdp-description-toggle]')
    const atcBtn = modal.querySelector('[data-spectrum-pdp-atc]')
    const buyNowBtn = modal.querySelector('[data-spectrum-pdp-buy-now]')
    const shareBtn = modal.querySelector('[data-spectrum-pdp-share]')
    const viewProductLink = modal.querySelector('[data-spectrum-pdp-view-product]')
    // Cache the configured ATC / Buy Now labels so we can restore them when
    // a different (available) variant is selected after a sold-out one.
    const atcDefaultLabel = atcBtn?.textContent ?? ''
    const buyNowDefaultLabel = buyNowBtn?.textContent ?? ''
    const soldOutLabel =
      typeof cfg.soldOutLabel === 'string' && cfg.soldOutLabel ? cfg.soldOutLabel : 'Sold Out'

    let returnFocusTo = null
    let activeProduct = null
    let selectedVariantId = null
    let autoPlayTimer = null

    function stopAutoPlay() {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer)
        autoPlayTimer = null
      }
    }

    function close() {
      modal.hidden = true
      document.documentElement.classList.remove(`sai-${SNIPPET_ID}-body-locked`)
      stopAutoPlay()
      if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
        try {
          returnFocusTo.focus()
        } catch {}
      }
      returnFocusTo = null
      activeProduct = null
      selectedVariantId = null
    }

    function renderGallery(images) {
      while (trackEl.firstChild) trackEl.removeChild(trackEl.firstChild)
      const count = images.length
      for (const [i, src] of images.entries()) {
        const slide = document.createElement('div')
        slide.className = `sai-${SNIPPET_ID}__pdp-slide`
        slide.setAttribute('role', 'group')
        slide.setAttribute('aria-roledescription', 'slide')
        slide.setAttribute('aria-label', `Image ${i + 1} of ${count}`)
        const img = document.createElement('img')
        img.src = src
        img.alt = ''
        img.loading = i === 0 ? 'eager' : 'lazy'
        slide.appendChild(img)
        trackEl.appendChild(slide)
      }

      const showCarouselNav = cfg.galleryStyle === 'carousel' && count > 1
      if (chevronPrev) chevronPrev.hidden = !(showCarouselNav && cfg.showChevrons)
      if (chevronNext) chevronNext.hidden = !(showCarouselNav && cfg.showChevrons)

      if (dotsEl) {
        while (dotsEl.firstChild) dotsEl.removeChild(dotsEl.firstChild)
        if (showCarouselNav && cfg.showDots) {
          dotsEl.hidden = false
          for (let i = 0; i < count; i++) {
            const dot = document.createElement('button')
            dot.type = 'button'
            dot.className = `sai-${SNIPPET_ID}__pdp-dot${i === 0 ? ' is-active' : ''}`
            dot.setAttribute('aria-label', `Show image ${i + 1}`)
            if (i === 0) dot.setAttribute('aria-selected', 'true')
            dot.addEventListener('click', () => {
              const stride = trackEl.clientWidth
              trackEl.scrollTo({ left: i * stride, behavior: 'smooth' })
            })
            dotsEl.appendChild(dot)
          }
        } else {
          dotsEl.hidden = true
        }
      }
    }

    function updateGalleryActiveState() {
      const stride = trackEl.clientWidth
      if (stride <= 0) return
      const idx = Math.max(
        0,
        Math.min(Math.round(trackEl.scrollLeft / stride), trackEl.children.length - 1),
      )
      if (dotsEl && !dotsEl.hidden) {
        const dots = dotsEl.children
        for (let i = 0; i < dots.length; i++) {
          const active = i === idx
          dots[i].classList.toggle('is-active', active)
          if (active) dots[i].setAttribute('aria-selected', 'true')
          else dots[i].removeAttribute('aria-selected')
        }
      }
      if (chevronPrev && !chevronPrev.hidden) chevronPrev.disabled = idx === 0
      if (chevronNext && !chevronNext.hidden)
        chevronNext.disabled = idx === trackEl.children.length - 1
    }

    function renderVariants(variants) {
      if (!variantsEl) return
      while (variantsEl.firstChild) variantsEl.removeChild(variantsEl.firstChild)

      if (cfg.variantSelectorStyle === 'dropdown') {
        const select = document.createElement('select')
        select.setAttribute('aria-label', 'Choose a variant')
        for (const v of variants) {
          const opt = document.createElement('option')
          opt.value = String(v.id)
          opt.textContent = cfg.showPriceInVariant && v.price ? `${v.title} — ${v.price}` : v.title
          if (v.available === false) opt.disabled = true
          select.appendChild(opt)
        }
        select.addEventListener('change', () => setSelectedVariant(select.value))
        variantsEl.appendChild(select)
        return
      }

      for (const v of variants) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `sai-${SNIPPET_ID}__pdp-variant`
        btn.dataset.variantId = String(v.id)
        btn.setAttribute('role', 'radio')
        btn.setAttribute('aria-checked', 'false')

        const titleSpan = document.createElement('span')
        titleSpan.className = `sai-${SNIPPET_ID}__pdp-variant-title`
        titleSpan.textContent = typeof v.title === 'string' ? v.title : ''
        btn.appendChild(titleSpan)

        if (cfg.showPriceInVariant && v.price) {
          const priceSpan = document.createElement('span')
          priceSpan.className = `sai-${SNIPPET_ID}__pdp-variant-price`
          priceSpan.innerHTML = v.price
          btn.appendChild(priceSpan)
        }

        if (v.available === false) {
          btn.disabled = true
          btn.setAttribute('aria-disabled', 'true')
        }

        btn.addEventListener('click', () => {
          if (btn.disabled) return
          setSelectedVariant(v.id)
        })

        variantsEl.appendChild(btn)
      }
    }

    function variantById(id) {
      if (!activeProduct) return null
      const idStr = String(id)
      return activeProduct.variants.find((v) => String(v.id) === idStr) ?? null
    }

    function setSelectedVariant(id) {
      selectedVariantId = id == null ? null : String(id)
      const v = variantById(selectedVariantId)

      if (variantsEl) {
        for (const btn of variantsEl.querySelectorAll(`.sai-${SNIPPET_ID}__pdp-variant`)) {
          const isMatch = btn.dataset.variantId === selectedVariantId
          btn.classList.toggle('is-selected', isMatch)
          btn.setAttribute('aria-checked', isMatch ? 'true' : 'false')
        }
      }

      if (v) {
        if (priceCurrentEl) priceCurrentEl.innerHTML = v.price ?? ''
        if (priceMrpEl) {
          if (v.compareAtPrice && discountPercent(v.price, v.compareAtPrice) !== null) {
            priceMrpEl.innerHTML = v.compareAtPrice
            priceMrpEl.hidden = false
          } else {
            priceMrpEl.hidden = true
            priceMrpEl.innerHTML = ''
          }
        }
        if (discountEl) {
          const text = formatDiscount(v.price, v.compareAtPrice, cfg.discountFormat)
          if (text) {
            discountEl.textContent = text
            discountEl.hidden = false
          } else {
            discountEl.hidden = true
            discountEl.textContent = ''
          }
        }
      }

      if (lowStockEl && cfg.showLowInventoryCallout) {
        const qty = v?.inventoryQuantity
        const threshold = Number(cfg.lowInventoryThreshold) || 10
        if (typeof qty === 'number' && qty > 0 && qty <= threshold) {
          const tmpl = String(cfg.lowInventoryText || 'Only {n} available')
          if (lowStockTextEl) lowStockTextEl.textContent = tmpl.replace('{n}', String(qty))
          lowStockEl.hidden = false
        } else {
          lowStockEl.hidden = true
        }
      }

      const enabled = v != null && v.available !== false
      if (atcBtn) {
        atcBtn.disabled = !enabled
        atcBtn.textContent = enabled ? atcDefaultLabel : soldOutLabel
      }
      if (buyNowBtn) {
        buyNowBtn.disabled = !enabled
        buyNowBtn.textContent = enabled ? buyNowDefaultLabel : soldOutLabel
      }
    }

    function renderDescription(html) {
      if (!descEl || !descBody) return
      descBody.innerHTML = html ?? ''
      if (cfg.descriptionStyle !== 'expandable' || !descToggle) return
      descEl.classList.add('is-collapsed')
      requestAnimationFrame(() => {
        const overflowing = descBody.scrollHeight > descBody.clientHeight + 4
        descToggle.hidden = !overflowing
        descToggle.textContent = 'Read more'
        descToggle.setAttribute('aria-expanded', 'false')
      })
    }

    function getQuantity() {
      if (!qtyInput) return 1
      const n = Number.parseInt(qtyInput.value, 10)
      return Number.isFinite(n) && n > 0 ? n : 1
    }

    function startAutoPlay(slideCount) {
      stopAutoPlay()
      autoPlayTimer = setInterval(() => {
        const stride = trackEl.clientWidth
        if (stride <= 0) return
        const idx = Math.round(trackEl.scrollLeft / stride)
        const next = (idx + 1) % slideCount
        trackEl.scrollTo({ left: next * stride, behavior: 'smooth' })
      }, 4000)
    }

    function open(payload, triggerEl) {
      if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) return
      activeProduct = payload
      returnFocusTo = triggerEl ?? null

      // Clear loading state from any prior open so a stale spinner never
      // overlays a fresh button label.
      if (atcBtn) atcBtn.removeAttribute('aria-busy')
      if (buyNowBtn) buyNowBtn.removeAttribute('aria-busy')

      if (titleEl) titleEl.textContent = payload.title ?? ''
      if (viewProductLink && payload.url) viewProductLink.setAttribute('href', payload.url)

      const images =
        Array.isArray(payload.images) && payload.images.length > 0 ? payload.images : []
      renderGallery(images)
      requestAnimationFrame(() => {
        trackEl.scrollLeft = 0
        updateGalleryActiveState()
      })

      renderVariants(payload.variants)
      const firstAvailable = payload.variants.find((v) => v.available !== false)
      setSelectedVariant(firstAvailable?.id ?? payload.variants[0].id)

      if (qtyInput) qtyInput.value = '1'

      if (cfg.showDescription) {
        renderDescription(payload.description)
      }

      modal.hidden = false
      document.documentElement.classList.add(`sai-${SNIPPET_ID}-body-locked`)

      if (cfg.galleryStyle === 'carousel' && cfg.autoPlay && images.length > 1) {
        startAutoPlay(images.length)
      }

      const focusable =
        modal.querySelector(`.sai-${SNIPPET_ID}__pdp-variant:not(:disabled)`) ?? closeBtn
      focusable?.focus?.()
    }

    backdrop?.addEventListener('click', close)
    closeBtn?.addEventListener('click', close)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close()
    })

    if (chevronPrev) {
      chevronPrev.addEventListener('click', () => {
        const stride = trackEl.clientWidth
        trackEl.scrollBy({ left: -stride, behavior: 'smooth' })
      })
    }
    if (chevronNext) {
      chevronNext.addEventListener('click', () => {
        const stride = trackEl.clientWidth
        trackEl.scrollBy({ left: stride, behavior: 'smooth' })
      })
    }
    trackEl.addEventListener('scroll', updateGalleryActiveState, { passive: true })
    window.addEventListener('resize', updateGalleryActiveState)

    modal.addEventListener('mouseenter', stopAutoPlay)
    modal.addEventListener('focusin', stopAutoPlay)

    if (qtyDec && qtyInput) {
      qtyDec.addEventListener('click', () => {
        const n = getQuantity()
        qtyInput.value = String(Math.max(1, n - 1))
      })
    }
    if (qtyInc && qtyInput) {
      qtyInc.addEventListener('click', () => {
        qtyInput.value = String(getQuantity() + 1)
      })
    }

    if (descToggle && descEl) {
      descToggle.addEventListener('click', () => {
        const collapsed = descEl.classList.toggle('is-collapsed')
        descToggle.textContent = collapsed ? 'Read more' : 'Read less'
        descToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      })
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (!activeProduct) return
        const data = {
          title: activeProduct.title ?? '',
          url: activeProduct.url
            ? new URL(activeProduct.url, window.location.origin).toString()
            : window.location.href,
        }
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share(data)
            return
          } catch {}
        }
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(data.url)
            shareBtn.setAttribute('data-copied', 'true')
            setTimeout(() => shareBtn.removeAttribute('data-copied'), 2000)
          } catch {}
        }
      })
    }

    if (atcBtn) {
      atcBtn.addEventListener('click', async () => {
        if (selectedVariantId == null || atcBtn.disabled) return
        atcBtn.disabled = true
        atcBtn.setAttribute('aria-busy', 'true')
        const startedAt = Date.now()
        const quantity = getQuantity()
        try {
          const result = await addVariantToCart(selectedVariantId, quantity)
          const elapsed = Date.now() - startedAt
          if (elapsed < MIN_SPINNER_MS) {
            await new Promise((r) => setTimeout(r, MIN_SPINNER_MS - elapsed))
          }
          notifyCartUpdate({
            variantId: selectedVariantId,
            productId: activeProduct?.productId,
            response: result,
          })
          // Fire AFTER successful cart write — never fire on a failed POST.
          // `source: 'mini_pdp'` separates the modal-driven add from the
          // single-variant instant-add path emitted by initAtcButtons.
          trackFn(`${FEATURE_SLUG}:add_to_cart`, {
            product_id: activeProduct?.productId ?? null,
            product_handle: productHandleFromUrl(activeProduct?.url),
            variant_id: selectedVariantId,
            quantity,
            source: 'mini_pdp',
          })
          close()
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[Featured Collection] Add to cart failed', err)
          atcBtn.disabled = false
          atcBtn.removeAttribute('aria-busy')
        }
      })
    }

    if (buyNowBtn) {
      buyNowBtn.addEventListener('click', async () => {
        if (selectedVariantId == null || buyNowBtn.disabled) return
        buyNowBtn.disabled = true
        buyNowBtn.setAttribute('aria-busy', 'true')
        const startedAt = Date.now()
        try {
          await addVariantToCart(selectedVariantId, getQuantity())
          const elapsed = Date.now() - startedAt
          if (elapsed < MIN_SPINNER_MS) {
            await new Promise((r) => setTimeout(r, MIN_SPINNER_MS - elapsed))
          }
          window.location.href = '/checkout'
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[Featured Collection] Buy now failed', err)
          buyNowBtn.disabled = false
          buyNowBtn.removeAttribute('aria-busy')
        }
      })
    }

    return { open, close }
  }

  // ── Per-card image carousel ────────────────────────────────
  function initImageCarousels(node) {
    const tracks = node.querySelectorAll('[data-spectrum-image-track]')
    for (const track of tracks) {
      const zone = track.parentElement
      if (!zone) continue
      const slides = Array.from(track.children)
      if (slides.length === 0) continue
      const dotsContainer = zone.querySelector('[data-spectrum-image-dots]')
      const dots = dotsContainer ? Array.from(dotsContainer.children) : []

      function update() {
        const stride = track.clientWidth
        if (stride <= 0) return
        const idx = Math.round(track.scrollLeft / stride)
        const clamped = Math.max(0, Math.min(idx, slides.length - 1))
        for (let i = 0; i < dots.length; i++) {
          const dot = dots[i]
          const active = i === clamped
          dot.classList.toggle('is-active', active)
          if (active) dot.setAttribute('aria-selected', 'true')
          else dot.removeAttribute('aria-selected')
        }
      }

      for (const dot of dots) {
        dot.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const idx = Number.parseInt(dot.dataset.spectrumImageDot ?? '0', 10)
          if (!Number.isFinite(idx)) return
          const stride = track.clientWidth
          track.scrollTo({ left: idx * stride, behavior: 'smooth' })
        })
      }

      track.addEventListener('scroll', update, { passive: true })
      window.addEventListener('resize', update)
      update()
    }
  }

  /**
   * CTA click → either instant-add the only variant, or open the inline
   * Mini-PDP with the per-card payload.
   *
   * Single-variant products skip the modal entirely — there's nothing to
   * pick — and add straight to cart with the same spinner + cart-drawer
   * notify the Mini-PDP uses.  Multi-variant (or sole-variant-unavailable)
   * products open the modal so the shopper can choose / see the state.
   *
   * Falls back to navigating to PDP only when no payload could be parsed.
   */
  function initAtcButtons(node, dialog, track) {
    const trackFn = typeof track === 'function' ? track : noopTrack
    const ctas = node.querySelectorAll(
      [
        `.sai-${SNIPPET_ID}__cta[data-spectrum-atc]`,
        `.sai-${SNIPPET_ID}__secondary-cta[data-spectrum-atc]`,
        `.sai-${SNIPPET_ID}__tertiary-cta[data-spectrum-atc]`,
      ].join(','),
    )
    for (const cta of ctas) {
      // At render time: if every variant on this product is `available: false`,
      // flip the CTA into a disabled "Sold Out" state.  The label uses the
      // merchant-configured `sold_out_label` (Liquid threads it through via
      // `data-sold-out-label`).
      const productId = cta.dataset.productId
      if (productId) {
        const payload = readPayloadForProduct(node, productId)
        if (
          payload &&
          Array.isArray(payload.variants) &&
          payload.variants.length > 0 &&
          payload.variants.every((v) => v.available === false)
        ) {
          const soldOutLabel = cta.dataset.soldOutLabel || 'Sold Out'
          cta.textContent = soldOutLabel
          cta.setAttribute('aria-disabled', 'true')
          cta.classList.add('is-soldout')
        }
      }

      cta.addEventListener('click', async (e) => {
        // Route on the action attribute first. CTAs that handle non-cart
        // actions (share, toggle_wishlist) have `data-spectrum-pid` but
        // not `data-product-id` (theme protection — see the Liquid
        // comment) so the legacy `productId` short-circuit below would
        // skip them. We handle those branches up front.
        const action =
          cta.dataset.spectrumAction || cta.dataset.spectrumPrimaryAction || 'add_to_cart'
        const pid = cta.dataset.productId || cta.dataset.spectrumPid || null
        const productTitle = cta.dataset.productTitle || ''
        const productHandle = productHandleFromUrl(cta.href)

        if (action === 'share') {
          e.preventDefault()
          const url = cta.href
            ? new URL(cta.href, window.location.origin).toString()
            : window.location.href
          const method = await shareProductUrl({ title: productTitle, url })
          trackFn(`${FEATURE_SLUG}:share`, {
            product_id: pid,
            product_handle: productHandle,
            method,
          })
          return
        }

        if (action === 'toggle_wishlist') {
          e.preventDefault()
          const nowWishlisted = !cta.classList.contains('is-wishlisted')
          cta.classList.toggle('is-wishlisted', nowWishlisted)
          trackFn(`${FEATURE_SLUG}:wishlist_toggle`, {
            product_id: pid,
            product_handle: productHandle,
            state: nowWishlisted ? 'added' : 'removed',
          })
          return
        }

        // add_to_cart and buy_now both go through the cart-add path. The
        // only difference: after a successful single-variant add, buy_now
        // redirects to /checkout (matching the Mini-PDP "Buy now" button).
        const productId = cta.dataset.productId
        if (!productId) return
        const payload = readPayloadForProduct(node, productId)
        if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) return

        e.preventDefault()

        if (cta.getAttribute('aria-busy') === 'true') return
        if (cta.getAttribute('aria-disabled') === 'true') return

        // Single-variant products skip the modal unconditionally.  Nothing
        // to pick — and a malformed id / OOS state should surface as a
        // failed cart POST (logged in the catch), not as a useless modal
        // with one strikethrough pill.
        if (payload.variants.length === 1) {
          const onlyVariant = payload.variants[0]
          cta.setAttribute('aria-busy', 'true')
          const startedAt = Date.now()
          try {
            const result = await addVariantToCart(onlyVariant.id, 1)
            const elapsed = Date.now() - startedAt
            if (elapsed < MIN_SPINNER_MS) {
              await new Promise((r) => setTimeout(r, MIN_SPINNER_MS - elapsed))
            }
            notifyCartUpdate({
              variantId: onlyVariant.id,
              productId: payload.productId ?? productId,
              response: result,
            })
            // `source: 'instant'` separates the single-variant fast path
            // from the modal-driven add emitted by initMiniPdp.
            trackFn(`${FEATURE_SLUG}:add_to_cart`, {
              product_id: payload.productId ?? productId ?? null,
              product_handle: productHandleFromUrl(payload.url ?? cta.href),
              variant_id: onlyVariant.id,
              quantity: 1,
              source: 'instant',
            })
            // buy_now: after the add lands, redirect to checkout instead
            // of staying on the listing. Matches the Mini-PDP "Buy now"
            // button behaviour.
            if (action === 'buy_now') {
              trackFn(`${FEATURE_SLUG}:buy_now`, {
                product_id: payload.productId ?? productId ?? null,
                product_handle: productHandleFromUrl(payload.url ?? cta.href),
                variant_id: onlyVariant.id,
                quantity: 1,
                source: 'instant',
              })
              window.location.href = '/checkout'
              return
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[Featured Collection] Instant add to cart failed', err)
          } finally {
            cta.removeAttribute('aria-busy')
          }
          return
        }

        if (!dialog) {
          window.location.href = cta.href
          return
        }

        // Fire `mini_pdp_open` BEFORE dialog.open() so the timestamp captures
        // intent (the open() call paints the modal synchronously; ordering
        // doesn't affect UX but it keeps the event causally upstream of any
        // in-modal events that follow).
        const cardElForOpen = cta.closest(CARD_SELECTOR)
        trackFn(`${FEATURE_SLUG}:mini_pdp_open`, {
          product_id: payload.productId ?? productId ?? null,
          product_handle: productHandleFromUrl(payload.url ?? cta.href),
          position: cardPosition(cardElForOpen),
        })

        dialog.open(
          {
            productId: payload.productId ?? productId,
            title: payload.title ?? cta.dataset.productTitle ?? '',
            url: payload.url ?? cta.href,
            description: payload.description ?? '',
            images: Array.isArray(payload.images) ? payload.images : [],
            variants: payload.variants,
          },
          cta,
        )
      })
    }
  }

  if (typeof globalThis !== 'undefined' && globalThis.__SAI_TEST_HARNESS__ === true) {
    globalThis.__saiTcm9wosw = {
      applyVariant,
      clampCpr,
      resolveCardsPerRow,
      currentIndexFor,
      readPayloadForProduct,
      discoverCartSectionIds,
      discountPercent,
      formatDiscount,
      productHandleFromUrl,
      cardPosition,
      safeTrack,
    }
  }

  // Card-link clicks are intent-to-navigate. We fire BEFORE the browser
  // commits the navigation (no preventDefault) so the event lands in
  // PostHog even when the user immediately lands on the PDP. Native link
  // semantics (cmd-click, middle-click, right-click → Open in new tab)
  // still work — we never call preventDefault from here.
  // ── Tab strip ───────────────────────────────────────────────
  //
  // Tabs / panels are siblings inside the snippet root. Active state lives
  // on three DOM signals — kept atomic so a partial flip can't leave the
  // a11y tree inconsistent:
  //   - `.is-active` class on the chip (CSS hook)
  //   - `aria-selected` + `tabindex` on the chip
  //   - `hidden` + `aria-hidden` on the panel
  //
  // All panels SSR-render so the carousels / swatches / mini-PDP wiring
  // initialises eagerly on every panel — the click handler only flips
  // visibility, never tears down or rebinds.
  function initTabs(node, track) {
    const trackFn = typeof track === 'function' ? track : noopTrack
    const tabs = Array.from(node.querySelectorAll(`.sai-${SNIPPET_ID}__tab[data-spectrum-tab]`))
    const panels = Array.from(
      node.querySelectorAll(`.sai-${SNIPPET_ID}__panel[data-spectrum-tab-panel]`),
    )
    if (tabs.length === 0 || panels.length === 0) return

    function activate(index) {
      if (index < 0 || index >= tabs.length) return
      for (let i = 0; i < tabs.length; i++) {
        const isActive = i === index
        const tab = tabs[i]
        tab.classList.toggle('is-active', isActive)
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false')
        tab.setAttribute('tabindex', isActive ? '0' : '-1')
        const panel = panels[i]
        if (!panel) continue
        if (isActive) {
          panel.removeAttribute('hidden')
          panel.removeAttribute('aria-hidden')
          // Match the SSR-emitted inline `style="display: none !important"`
          // on inactive panels — drop the inline override so CSS controls
          // the active panel's layout.
          panel.style.removeProperty('display')
        } else {
          panel.setAttribute('hidden', '')
          panel.setAttribute('aria-hidden', 'true')
          // Hard inline-style override with `!important` — beats any theme
          // CSS that might fight the `[hidden]` attribute selector. Inline
          // style with !important is the highest-priority selector outside
          // of !important rules in author stylesheets, so this is the
          // smallest hammer that always wins.
          panel.style.setProperty('display', 'none', 'important')
        }
      }
      trackFn(`${FEATURE_SLUG}:tab_change`, { tab_index: index })
    }

    for (let i = 0; i < tabs.length; i++) {
      const index = i
      const tab = tabs[i]
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-selected') === 'true') return
        activate(index)
        // Move focus to the newly active chip so screen readers announce
        // the selection and keyboard users land on the right tabstop.
        tab.focus()
      })
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const delta = e.key === 'ArrowRight' ? 1 : -1
        const next = (index + delta + tabs.length) % tabs.length
        activate(next)
        tabs[next]?.focus()
      })
    }
  }

  function initCardLinkTracking(node, track) {
    if (typeof track !== 'function') return
    const links = node.querySelectorAll(`.sai-${SNIPPET_ID}__card-link`)
    for (const link of links) {
      link.addEventListener('click', () => {
        const cardEl = link.closest(CARD_SELECTOR)
        // Read product_id from the sibling CTA's data attribute. Card
        // doesn't carry product_id itself; CTA does. When show_cta is
        // false the CTA is absent — fall back to null.
        const cta = cardEl?.querySelector(`.sai-${SNIPPET_ID}__cta[data-spectrum-atc]`)
        track(`${FEATURE_SLUG}:card_click`, {
          product_id: cta?.dataset.productId ?? null,
          product_handle: productHandleFromUrl(link.getAttribute('href')),
          position: cardPosition(cardEl),
        })
      })
    }
  }

  const snippetApi = window.__spectrumAi?.snippet
  const containers = document.querySelectorAll(
    `[data-spectrum-instance-id][data-spectrum-snippet-id="${SNIPPET_ID}"]`,
  )
  for (const node of containers) {
    // Bind FIRST so the analytics handles are available before we wire any
    // click listeners that may want to track. Bind is idempotent per node;
    // returns `{ track, emit, unsubscribe }` or undefined if the SDK isn't
    // loaded (theme without the artifacts snippet).
    let track = null
    if (snippetApi && typeof snippetApi.bind === 'function') {
      const handles = snippetApi.bind(node, ({ variants, currentVariantId }) => {
        const variant = variants.find((v) => v.variantId === currentVariantId)
        if (!variant || !variant.content) return
        applyVariant(node, variant.content)
      })
      track = handles?.track ? safeTrack(handles.track) : null
    }

    // Mini-PDP is a singleton at the container root; one modal serves
    // every tab panel's cards. Initialise it once per instance.
    const miniPdp = initMiniPdp(node, track)

    // Per-panel: each tab panel has its own `__layout` block, so the
    // carousel / image-track / atc / card-link wiring runs once per
    // panel. Hidden panels still init — visibility flips by `hidden`
    // attribute later (no rebind on tab change).
    const panelSelector = `.sai-${SNIPPET_ID}__panel[data-spectrum-tab-panel]`
    const panels = node.querySelectorAll(panelSelector)
    const initRoots = panels.length > 0 ? panels : [node]
    for (const root of initRoots) {
      initCarousel(root)
      initImageCarousels(root)
      initAtcButtons(root, miniPdp, track)
      initCardLinkTracking(root, track)
    }

    initTabs(node, track)
  }
})()
