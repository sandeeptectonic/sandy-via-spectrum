// Spectrum Carousel Videos - Theme Integrated Runtime
class SpectrumCarousel {
  constructor(section) {
    this.section = section;
    this.sectionId = section.dataset.sectionId;
    this.modal = document.getElementById(`spectrum-modal-${this.sectionId}`);
    this.init();
  }

  init() {
    // Initialize carousel triggers
    this.section.querySelectorAll('.spectrum-carousel__trigger').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(trigger);
      });
    });

    // Initialize navigation
    const prevBtn = this.section.querySelector('.spectrum-carousel__nav-prev');
    const nextBtn = this.section.querySelector('.spectrum-carousel__nav-next');

    if (prevBtn) prevBtn.addEventListener('click', () => this.navigate('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => this.navigate('next'));

    // Initialize modal close functionality
    if (this.modal) {
      const closeBtn = this.modal.querySelector('.spectrum-modal__close');
      const backdrop = this.modal.querySelector('.spectrum-modal__backdrop');

      if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
      if (backdrop) backdrop.addEventListener('click', () => this.closeModal());

      // Close modal on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal.classList.contains('active')) {
          this.closeModal();
        }
      });
    }

    // Initialize intersection observer for video previews
    this.initVideoObserver();

    // Initialize navigation state and scroll listeners
    this.initCarouselScrolling();
  }

  initVideoObserver() {
    // Pause preview videos when they're out of view
    const videos = this.section.querySelectorAll('.spectrum-carousel__preview');

    if (videos.length === 0 || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Video autoplay blocked, that's okay
          });
        } else {
          video.pause();
        }
      });
    }, {
      threshold: 0.5,
      rootMargin: '50px'
    });

    videos.forEach(video => observer.observe(video));
  }

  initCarouselScrolling() {
    // Initialize navigation state on load
    setTimeout(() => this.updateNavigationState(), 100);

    // Add scroll listener to update navigation state during manual scrolling
    const track = this.section.querySelector('.spectrum-carousel__track');
    if (track) {
      track.addEventListener('scroll', () => {
        // Debounce the navigation state update
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
          this.updateNavigationState();
        }, 100);
      });

      // Update navigation state on resize
      window.addEventListener('resize', () => {
        setTimeout(() => this.updateNavigationState(), 100);
      });
    }
  }

  openModal(trigger) {
    const videoUrl = trigger.dataset.videoUrl;
    const videoTitle = trigger.dataset.videoTitle;
    const videoId = trigger.dataset.videoId;

    if (!this.modal) {
      console.warn('Spectrum modal not found');
      return;
    }

    // Initialize modal carousel state
    this.currentVideoIndex = parseInt(trigger.dataset.videoIndex) || 0;
    this.videoData = this.gatherVideoData();

    // Create modal content dynamically
    this.createModalContent();

    // Initialize content based on screen size and ensure proper visibility
    const desktopContainer = this.modal.querySelector('.spectrum-modal__desktop-only');
    const mobileContainer = this.modal.querySelector('.spectrum-modal__mobile-only');

    if (window.innerWidth > 749) {
      // Desktop: Show carousel, hide mobile
      if (desktopContainer) {
        desktopContainer.style.display = 'flex';
        desktopContainer.style.visibility = 'visible';
        desktopContainer.style.opacity = '1';
      }
      if (mobileContainer) {
        mobileContainer.style.display = 'none';
        mobileContainer.style.visibility = 'hidden';
        mobileContainer.style.opacity = '0';
      }
      this.createVideoCarousel();
    } else {
      // Mobile: Show single video, hide carousel
      if (desktopContainer) {
        desktopContainer.style.display = 'none';
        desktopContainer.style.visibility = 'hidden';
        desktopContainer.style.opacity = '0';
      }
      if (mobileContainer) {
        mobileContainer.style.display = 'block';
        mobileContainer.style.visibility = 'visible';
        mobileContainer.style.opacity = '1';
      }
      this.switchToVideo(this.currentVideoIndex);
      this.initScrollNavigation();
    }

    // Show modal with ARIA management
    this.modal.classList.add('active');
    this.modal.setAttribute('aria-hidden', 'false');
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Focus management (after content is created)
    setTimeout(() => {
      const closeBtn = this.modal.querySelector('.spectrum-modal__close');
      if (closeBtn) closeBtn.focus();
    }, 100);

    // Emit custom event for analytics/tracking
    this.emit('spectrum:video:open', {
      videoId,
      videoTitle,
      videoUrl,
      videoIndex: this.currentVideoIndex
    });
  }

  createModalContent() {
    // Only create content if it doesn't exist
    if (this.modal.querySelector('.spectrum-modal__backdrop')) return;

    const modalHTML = `
      <div class="spectrum-modal__backdrop"></div>
      <div class="spectrum-modal__container">
        <button class="spectrum-modal__back" type="button" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button class="spectrum-modal__close" type="button" aria-label="Close video">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button class="spectrum-modal__cart" type="button" aria-label="View cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke-width="2"/>
            <line x1="3" y1="6" x2="21" y2="6" stroke-width="2"/>
            <path d="M16 10a4 4 0 0 1-8 0" stroke-width="2"/>
          </svg>
        </button>

        <div class="spectrum-modal__content">
          <!-- Desktop: Multi-video carousel -->
          <div class="spectrum-modal__carousel-container spectrum-modal__desktop-only">
            <button class="spectrum-modal__video-nav-prev" type="button" aria-label="Previous video">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke-width="2"/>
              </svg>
            </button>

            <div class="spectrum-modal__video-track">
              <!-- Video panels will be dynamically inserted here -->
            </div>

            <button class="spectrum-modal__video-nav-next" type="button" aria-label="Next video">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke-width="2"/>
              </svg>
            </button>
          </div>

          <!-- Mobile: Single video container -->
          <div class="spectrum-modal__video-container spectrum-modal__mobile-only">
            <video class="spectrum-modal__player" playsinline preload="metadata" muted loop></video>

            <button class="spectrum-modal__mute-btn" type="button" aria-label="Toggle mute">
              <svg class="spectrum-modal__mute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M18.36 6.64a9 9 0 0 1 0 10.72"/>
              </svg>
              <svg class="spectrum-modal__unmute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="display: none;">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            </button>
          </div>

          <!-- Product overlay (both desktop and mobile) -->
          <div class="spectrum-modal__product-overlay">
            <div class="spectrum-modal__products-container">
              <div class="spectrum-modal__products-track">
                <!-- Products will be dynamically inserted here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modal.innerHTML = modalHTML;

    // Setup event listeners for close functionality
    this.setupModalEventListeners();
  }

  setupModalEventListeners() {
    const closeBtn = this.modal.querySelector('.spectrum-modal__close');
    const backBtn = this.modal.querySelector('.spectrum-modal__back');
    const backdrop = this.modal.querySelector('.spectrum-modal__backdrop');
    const muteBtn = this.modal.querySelector('.spectrum-modal__mute-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => this.closeModal());
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeModal());
    }

    // Mute button only exists in mobile view
    if (muteBtn) {
      muteBtn.addEventListener('click', () => this.toggleMute());
    }

    // Setup navigation buttons for video carousel
    const videoPrevBtn = this.modal.querySelector('.spectrum-modal__video-nav-prev');
    const videoNextBtn = this.modal.querySelector('.spectrum-modal__video-nav-next');

    if (videoPrevBtn) {
      videoPrevBtn.addEventListener('click', () => this.navigateVideos('prev'));
    }

    if (videoNextBtn) {
      videoNextBtn.addEventListener('click', () => this.navigateVideos('next'));
    }

    // Product carousel navigation removed - now scroll-only

    // Store bound function for proper cleanup
    this.boundEscapeHandler = this.handleEscapeKey.bind(this);
    document.addEventListener('keydown', this.boundEscapeHandler);
  }

  handleEscapeKey(e) {
    if (e.key === 'Escape' && this.modal.classList.contains('active')) {
      this.closeModal();
    }
  }

  toggleMute() {
    const player = this.modal.querySelector('.spectrum-modal__player');
    const muteIcon = this.modal.querySelector('.spectrum-modal__mute-icon');
    const unmuteIcon = this.modal.querySelector('.spectrum-modal__unmute-icon');

    if (!player || !muteIcon || !unmuteIcon) return;

    if (player.muted) {
      // Unmute
      player.muted = false;
      muteIcon.style.display = 'block';
      unmuteIcon.style.display = 'none';
    } else {
      // Mute
      player.muted = true;
      muteIcon.style.display = 'none';
      unmuteIcon.style.display = 'block';
    }

    // Emit mute toggle event
    this.emit('spectrum:video:mute-toggle', {
      muted: player.muted,
      videoIndex: this.currentVideoIndex
    });
  }

  closeModal() {
    if (!this.modal) return;

    // Stop all videos (mobile single video or desktop carousel videos)
    const players = this.modal.querySelectorAll('video');
    players.forEach(player => {
      player.pause();
      player.src = '';
    });

    // Clean up scroll navigation
    this.cleanupScrollNavigation();

    // Remove escape key listener
    if (this.boundEscapeHandler) {
      document.removeEventListener('keydown', this.boundEscapeHandler);
      this.boundEscapeHandler = null;
    }

    // Hide modal with ARIA management
    this.modal.classList.remove('active');
    this.modal.setAttribute('aria-hidden', 'true');

    // Restore background scrolling
    document.body.style.overflow = '';

    // Destroy modal content to free memory
    this.modal.innerHTML = '';

    // Emit custom event
    this.emit('spectrum:video:close', {
      sectionId: this.sectionId
    });
  }

  cleanupScrollNavigation() {
    // Since we're destroying modal content, no need for complex cleanup
    // Event listeners will be automatically removed when DOM elements are destroyed
    this.scrollTimeout = null;
    this.lastScrollTime = 0;
    this.isScrolling = false;
    this.scrollDirection = 0;
  }

  gatherVideoData() {
    // Gather video data from the carousel triggers
    const triggers = this.section.querySelectorAll('.spectrum-carousel__trigger');
    return Array.from(triggers).map(trigger => ({
      videoId: trigger.dataset.videoId,
      videoUrl: trigger.dataset.videoUrl,
      videoTitle: trigger.dataset.videoTitle,
      videoIndex: parseInt(trigger.dataset.videoIndex)
    }));
  }

  initScrollNavigation() {
    if (!this.modal) return;

    // Reset scroll navigation state
    this.scrollTimeout = null;
    this.lastScrollTime = 0;
    this.isScrolling = false;
    this.scrollDirection = 0;

    // Add wheel event listener to modal
    this.modal.addEventListener('wheel', (e) => {
      e.preventDefault(); // Prevent default scrolling

      const now = Date.now();
      const timeDelta = now - this.lastScrollTime;

      // Throttle scroll events to prevent rapid switching
      if (timeDelta < 300) return;

      this.lastScrollTime = now;

      // Determine scroll direction and switch video
      if (e.deltaY > 0) {
        // Scrolling down - next video
        this.navigateToNextVideo();
      } else if (e.deltaY < 0) {
        // Scrolling up - previous video
        this.navigateToPrevVideo();
      }
    });

    // Add keyboard navigation
    this.modal.addEventListener('keydown', (e) => {
      if (!this.modal.classList.contains('active')) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.navigateToPrevVideo();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateToNextVideo();
          break;
      }
    });

    // Touch/swipe navigation for mobile
    this.initTouchNavigation();
  }

  initTouchNavigation() {
    let startY = 0;
    let endY = 0;
    let isTouch = false;

    this.modal.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      isTouch = true;
    }, { passive: true });

    this.modal.addEventListener('touchend', (e) => {
      if (!isTouch) return;

      endY = e.changedTouches[0].clientY;
      const deltaY = startY - endY;

      // Minimum swipe distance to trigger video change
      if (Math.abs(deltaY) > 50) {
        if (deltaY > 0) {
          // Swipe up - next video
          this.navigateToNextVideo();
        } else {
          // Swipe down - previous video
          this.navigateToPrevVideo();
        }
      }

      isTouch = false;
    }, { passive: true });
  }

  navigateToNextVideo() {
    if (this.currentVideoIndex < this.videoData.length - 1) {
      this.switchToVideo(this.currentVideoIndex + 1);
    }
  }

  navigateToPrevVideo() {
    if (this.currentVideoIndex > 0) {
      this.switchToVideo(this.currentVideoIndex - 1);
    }
  }

  switchToVideo(index) {
    if (!this.videoData || index < 0 || index >= this.videoData.length) return;

    const videoItem = this.videoData[index];
    const videoUrl = videoItem.videoUrl;
    const videoTitle = videoItem.videoTitle;
    const videoId = videoItem.videoId;

    // Update video player
    const player = this.modal.querySelector('.spectrum-modal__player');
    if (player && videoUrl) {
      player.src = videoUrl;
      player.setAttribute('aria-label', videoTitle || 'Video');

      // Auto-play when switching videos
      player.play().catch(() => {
        console.log('Video autoplay blocked');
      });
    }


    // Load products for this video
    this.loadModalProducts(videoId);

    // Update current index
    this.currentVideoIndex = index;

    // Emit video switch event
    this.emit('spectrum:video:switch', {
      videoId,
      videoTitle,
      videoUrl,
      videoIndex: index
    });
  }


  loadModalProducts(videoId) {
    const productsScript = document.querySelector(`script[data-modal-products-for="${videoId}"]`);
    const productOverlay = this.modal.querySelector('.spectrum-modal__product-overlay');

    if (!productsScript || !productOverlay) {
      if (productOverlay) {
        productOverlay.classList.remove('visible');
      }
      return;
    }

    try {
      const products = JSON.parse(productsScript.textContent);

      if (products.length === 0) {
        productOverlay.classList.remove('visible');
        return;
      }

      // Render all products in the carousel
      this.renderProductCarousel(products);

      // Show overlay with animation delay
      setTimeout(() => {
        productOverlay.classList.add('visible');
      }, 500);

    } catch (error) {
      console.error('Error loading modal products for video:', videoId, error);
      productOverlay.classList.remove('visible');
    }
  }

  renderProductCarousel(products) {
    const track = this.modal.querySelector('.spectrum-modal__products-track');
    if (!track) {
      console.error('Product track not found');
      return;
    }

    // Clear existing products
    track.innerHTML = '';

    console.log('Rendering', products.length, 'products');

    // Create product cards or fallback
    if (products.length === 0) {
      // Show fallback message
      track.innerHTML = `
        <div class="spectrum-modal__no-products">
          <p>No products available for this video</p>
        </div>
      `;
    } else {
      products.forEach((product, index) => {
        const productCard = this.createProductCard(product, index);
        track.appendChild(productCard);
      });
    }
  }

  createProductCard(product, index) {
    const card = document.createElement('div');
    card.className = 'spectrum-modal__product-card';

    // Escape HTML to prevent XSS
    const escapeHtml = (str) => {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };


    // Provide fallbacks for missing data
    const productTitle = product.title || 'Untitled Product';
    const productPrice = product.price || '$0.00';
    const productImage = product.image || '';
    const productUrl = product.url || '#';

    card.innerHTML = `
      <div class="spectrum-modal__product-info">
        ${productImage ?
          `<img class="spectrum-modal__product-image" src="${escapeHtml(productImage)}" alt="${escapeHtml(productTitle)}" loading="lazy" onerror="this.style.display='none'">` :
          `<div class="spectrum-modal__product-image spectrum-modal__product-image--placeholder"></div>`
        }
        <div class="spectrum-modal__product-details">
          <h3 class="spectrum-modal__product-title">${escapeHtml(productTitle)}</h3>
          <div class="spectrum-modal__product-price">${escapeHtml(productPrice)}</div>
          ${!product.available ? '<div class="spectrum-modal__product-status">Sold out</div>' : ''}
        </div>
        <button class="spectrum-modal__shop-btn" type="button">
          Shop Now
        </button>
      </div>
    `;

    // Add click tracking for shop button
    const shopBtn = card.querySelector('.spectrum-modal__shop-btn');
    if (shopBtn) {
      shopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (productUrl !== '#') {
          window.location.href = productUrl;
        }

        // Emit product click event
        this.emit('spectrum:product:click', {
          productId: product.id,
          productTitle: productTitle,
          productHandle: product.handle,
          source: 'modal_overlay',
          productIndex: index
        });
      });
    }

    return card;
  }

  loadProducts(videoId) {
    const productsScript = document.querySelector(`script[data-products-for="${videoId}"]`);
    const productsTrack = this.modal.querySelector('.spectrum-modal__products-track');
    const productsOverlay = this.modal.querySelector('.spectrum-modal__product-overlay');

    if (!productsScript || !productsTrack || !productsOverlay) return;

    try {
      const products = JSON.parse(productsScript.textContent);
      productsTrack.innerHTML = '';

      if (products.length === 0) {
        productsOverlay.style.display = 'none';
        return;
      }

      products.forEach((product, index) => {
        const card = this.createProductCard(product, index);
        productsTrack.appendChild(card);
      });

      // Show products overlay
      productsOverlay.classList.add('visible');

      // Emit event for products loaded
      this.emit('spectrum:products:loaded', {
        videoId,
        productCount: products.length
      });
    } catch (error) {
      console.error('Error loading products for video:', videoId, error);
      productsOverlay.classList.remove('visible');
    }
  }

  // Product navigation methods removed - products now scroll freely

  gatherVideoData() {
    // Gather all video data from the section
    const videoTriggers = this.section.querySelectorAll('.spectrum-carousel__trigger');
    return Array.from(videoTriggers).map((trigger, index) => ({
      index,
      videoUrl: trigger.dataset.videoUrl,
      videoTitle: trigger.dataset.videoTitle,
      videoId: trigger.dataset.videoId,
      trigger
    }));
  }

  createVideoCarousel() {
    // Only for desktop - populate the video carousel
    const track = this.modal.querySelector('.spectrum-modal__video-track');
    if (!track) return;

    track.innerHTML = '';

    // Create 3 video panels centered around current video
    const centerIndex = this.currentVideoIndex;
    const videoCount = this.videoData.length;

    for (let i = -1; i <= 1; i++) {
      const videoIndex = (centerIndex + i + videoCount) % videoCount;
      const videoItem = this.videoData[videoIndex];
      const panel = this.createVideoPanel(videoItem, i);
      track.appendChild(panel);
    }

    // Update navigation button states
    this.updateVideoNavButtons();
  }

  createVideoPanel(videoItem, positionOffset) {
    const panel = document.createElement('div');
    panel.className = 'spectrum-modal__video-panel';

    // Assign size class based on position (only center and side for 3-panel layout)
    if (positionOffset === 0) {
      panel.classList.add('spectrum-modal__video-panel--center');
    } else {
      panel.classList.add('spectrum-modal__video-panel--side');
    }

    panel.innerHTML = `
      <video
        src="${videoItem.videoUrl}"
        ${positionOffset === 0 ? 'autoplay' : ''}
        muted
        loop
        playsinline
        preload="metadata"
        aria-label="${videoItem.videoTitle || 'Video'}"
      ></video>
    `;

    // Add click handler for non-center panels
    if (positionOffset !== 0) {
      panel.style.cursor = 'pointer';
      panel.addEventListener('click', () => {
        this.navigateToVideo(videoItem.index);
      });
    }

    return panel;
  }

  navigateVideos(direction) {
    // Desktop video carousel navigation
    const videoCount = this.videoData.length;

    if (direction === 'prev') {
      this.currentVideoIndex = (this.currentVideoIndex - 1 + videoCount) % videoCount;
    } else {
      this.currentVideoIndex = (this.currentVideoIndex + 1) % videoCount;
    }

    // Recreate carousel with new center
    this.createVideoCarousel();

    // Load products for new video
    const currentVideo = this.videoData[this.currentVideoIndex];
    this.loadProducts(currentVideo.videoId);
  }

  navigateToVideo(targetIndex) {
    // Direct navigation to specific video
    this.currentVideoIndex = targetIndex;
    this.createVideoCarousel();

    const currentVideo = this.videoData[this.currentVideoIndex];
    this.loadProducts(currentVideo.videoId);
  }

  updateVideoNavButtons() {
    const prevBtn = this.modal.querySelector('.spectrum-modal__video-nav-prev');
    const nextBtn = this.modal.querySelector('.spectrum-modal__video-nav-next');

    if (!prevBtn || !nextBtn || this.videoData.length <= 1) return;

    // Always show navigation for carousel (since it loops)
    prevBtn.style.opacity = '1';
    prevBtn.style.pointerEvents = 'auto';
    nextBtn.style.opacity = '1';
    nextBtn.style.pointerEvents = 'auto';
  }


  navigate(direction) {
    // Enhanced carousel navigation for horizontal scrolling
    const track = this.section.querySelector('.spectrum-carousel__track');
    if (!track) return;

    // Calculate slide width (including gap)
    const slides = track.querySelectorAll('.spectrum-carousel__slide');
    if (slides.length === 0) return;

    const slideWidth = slides[0].offsetWidth;
    const gap = 16; // 1rem = 16px gap
    const slideWidthWithGap = slideWidth + gap;

    // How many slides to scroll (2 slides at a time for better UX)
    const slidesToScroll = 2;
    const scrollAmount = slideWidthWithGap * slidesToScroll;

    const currentScroll = track.scrollLeft;
    const maxScroll = track.scrollWidth - track.offsetWidth;

    let newScrollPosition;
    if (direction === 'prev') {
      newScrollPosition = Math.max(0, currentScroll - scrollAmount);
    } else {
      newScrollPosition = Math.min(maxScroll, currentScroll + scrollAmount);
    }

    track.scrollTo({
      left: newScrollPosition,
      behavior: 'smooth'
    });

    // Update navigation button states
    this.updateNavigationState();

    // Emit navigation event
    this.emit('spectrum:carousel:navigate', {
      direction,
      scrollPosition: newScrollPosition,
      slidesToScroll
    });
  }

  updateNavigationState() {
    // Update navigation button disabled states
    const track = this.section.querySelector('.spectrum-carousel__track');
    const prevBtn = this.section.querySelector('.spectrum-carousel__nav-prev');
    const nextBtn = this.section.querySelector('.spectrum-carousel__nav-next');

    if (!track || !prevBtn || !nextBtn) return;

    const currentScroll = track.scrollLeft;
    const maxScroll = track.scrollWidth - track.offsetWidth;

    // Disable/enable buttons based on scroll position
    prevBtn.disabled = currentScroll <= 0;
    nextBtn.disabled = currentScroll >= maxScroll - 1; // -1 for rounding errors

    // Add visual disabled state
    prevBtn.style.opacity = prevBtn.disabled ? '0.4' : '0.9';
    nextBtn.style.opacity = nextBtn.disabled ? '0.4' : '0.9';
    prevBtn.style.pointerEvents = prevBtn.disabled ? 'none' : 'all';
    nextBtn.style.pointerEvents = nextBtn.disabled ? 'none' : 'all';
  }

  emit(eventName, detail = {}) {
    // Emit custom events for tracking/analytics integration
    const event = new CustomEvent(eventName, {
      detail: {
        ...detail,
        sectionId: this.sectionId,
        timestamp: Date.now()
      },
      bubbles: true,
      cancelable: true
    });

    this.section.dispatchEvent(event);

    // Also emit globally for easier listening
    window.dispatchEvent(event);
  }

  // Public method to destroy instance
  destroy() {
    // Remove event listeners and clean up
    this.section.querySelectorAll('.spectrum-carousel__trigger').forEach(trigger => {
      trigger.replaceWith(trigger.cloneNode(true));
    });

    if (this.modal) {
      const closeBtn = this.modal.querySelector('.spectrum-modal__close');
      const backdrop = this.modal.querySelector('.spectrum-modal__backdrop');

      if (closeBtn) closeBtn.replaceWith(closeBtn.cloneNode(true));
      if (backdrop) backdrop.replaceWith(backdrop.cloneNode(true));
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.spectrum-carousel-videos');
  sections.forEach(section => {
    // Store instance for potential cleanup
    section._spectrumCarousel = new SpectrumCarousel(section);
  });
});

// Re-initialize for Shopify theme editor
if (typeof Shopify !== 'undefined' && Shopify.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    const section = event.target.querySelector('.spectrum-carousel-videos');
    if (section) {
      // Clean up existing instance
      if (section._spectrumCarousel) {
        section._spectrumCarousel.destroy();
      }
      // Create new instance
      section._spectrumCarousel = new SpectrumCarousel(section);
    }
  });

  document.addEventListener('shopify:section:unload', (event) => {
    const section = event.target.querySelector('.spectrum-carousel-videos');
    if (section && section._spectrumCarousel) {
      section._spectrumCarousel.destroy();
      section._spectrumCarousel = null;
    }
  });
}

// Export for advanced usage
window.SpectrumCarousel = SpectrumCarousel;