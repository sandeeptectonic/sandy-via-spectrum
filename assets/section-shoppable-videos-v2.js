// Shoppable Videos V2 - Enhanced with Carousel
console.log('🎬 Shoppable Videos V2 script loaded');

class ShoppableVideosV2 {
  constructor(section) {
    this.section = section;
    this.modal = document.getElementById(section.id + '-modal');
    this.modalBackdrop = this.modal.querySelector('.shoppable-videos-v2-modal__backdrop');
    this.modalClose = this.modal.querySelector('.shoppable-videos-v2-modal__close');
    this.videoPlayer = this.modal.querySelector('.shoppable-videos-v2-modal__player');
    this.productsTrack = this.modal.querySelector('.shoppable-videos-v2-modal__products-track');
    this.triggers = section.querySelectorAll('.shoppable-videos-v2__trigger');

    // Carousel elements
    this.slider = section.querySelector('[data-slider]');
    this.track = section.querySelector('[data-track]');
    this.slides = section.querySelectorAll('[data-slide]');
    this.prevBtn = section.querySelector('[data-nav="prev"]');
    this.nextBtn = section.querySelector('[data-nav="next"]');
    this.dots = section.querySelectorAll('[data-dot]');

    // State
    this.currentSlide = 0;
    this.totalSlides = this.slides.length;

    this.init();
  }

  init() {
    console.log('🎬 Initializing V2 with', this.triggers.length, 'video triggers');

    // Modal functionality
    this.initModal();

    // Carousel functionality
    this.initCarousel();

    // Update slider on resize
    window.addEventListener('resize', () => this.updateSlider());
  }

  initModal() {
    // Add click handlers to video triggers
    this.triggers.forEach((trigger, index) => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(trigger);
      });
    });

    // Close modal handlers
    if (this.modalClose) {
      this.modalClose.addEventListener('click', () => this.closeModal());
    }
    if (this.modalBackdrop) {
      this.modalBackdrop.addEventListener('click', () => this.closeModal());
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && this.modal.classList.contains('active')) {
        this.closeModal();
      }
    });
  }

  initCarousel() {
    if (this.totalSlides <= 1) return;

    // Navigation buttons
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.prevSlide());
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.nextSlide());
    }

    // Dots navigation
    this.dots.forEach((dot, index) => {
      dot.addEventListener('click', () => this.goToSlide(index));
    });

    // Touch/swipe support
    this.initSwipeSupport();

    // Auto-play (optional)
    if (this.section.dataset.autoplay === 'true') {
      this.startAutoplay();
    }

    this.updateSlider();
  }

  initSwipeSupport() {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    this.track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    });

    this.track.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
    });

    this.track.addEventListener('touchend', () => {
      if (!isDragging) return;

      const diff = startX - currentX;
      const threshold = 50;

      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          this.nextSlide();
        } else {
          this.prevSlide();
        }
      }

      isDragging = false;
    });
  }

  prevSlide() {
    this.currentSlide = this.currentSlide > 0 ? this.currentSlide - 1 : this.totalSlides - 1;
    this.updateSlider();
  }

  nextSlide() {
    this.currentSlide = this.currentSlide < this.totalSlides - 1 ? this.currentSlide + 1 : 0;
    this.updateSlider();
  }

  goToSlide(index) {
    this.currentSlide = index;
    this.updateSlider();
  }

  updateSlider() {
    if (!this.track) return;

    const slideWidth = this.getSlideWidth();
    const offset = -this.currentSlide * slideWidth;

    this.track.style.transform = `translateX(${offset}%)`;

    // Update dots
    this.dots.forEach((dot, index) => {
      dot.classList.toggle('shoppable-videos-v2__dot--active', index === this.currentSlide);
    });

    // Update navigation button states
    if (this.prevBtn) {
      this.prevBtn.style.opacity = this.currentSlide === 0 ? '0.5' : '1';
    }
    if (this.nextBtn) {
      this.nextBtn.style.opacity = this.currentSlide === this.totalSlides - 1 ? '0.5' : '1';
    }
  }

  getSlideWidth() {
    // Responsive slide widths
    if (window.innerWidth >= 990) {
      return 100 / Math.min(3, this.totalSlides); // 3 slides on desktop
    } else if (window.innerWidth >= 750) {
      return 100 / Math.min(2, this.totalSlides); // 2 slides on tablet
    } else {
      return 100; // 1 slide on mobile
    }
  }

  startAutoplay() {
    this.autoplayInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);

    // Pause on hover
    this.section.addEventListener('mouseenter', () => {
      clearInterval(this.autoplayInterval);
    });

    this.section.addEventListener('mouseleave', () => {
      this.startAutoplay();
    });
  }

  openModal(trigger) {
    const videoUrl = trigger.getAttribute('data-video-url');
    const videoTitle = trigger.getAttribute('data-video-title');
    const videoId = trigger.getAttribute('data-video-id');
    const noVideo = trigger.getAttribute('data-no-video') === 'true';

    console.log('🎬 Opening modal with:', { videoUrl, videoTitle, videoId, noVideo });

    if (!this.modal) {
      console.error('🎬 Modal element not found');
      return;
    }

    // Handle video display
    this.setupVideo(videoUrl, videoTitle, noVideo);

    // Load products
    this.loadProducts(videoId);

    // Show modal
    this.modal.classList.add('active');
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus management
    if (this.modalClose) {
      this.modalClose.focus();
    }
  }

  setupVideo(videoUrl, videoTitle, noVideo) {
    const videoSection = this.modal.querySelector('.shoppable-videos-v2-modal__video');

    // Remove loaded class to show loading spinner
    videoSection.classList.remove('loaded');

    if (noVideo || !videoUrl || videoUrl.trim() === '' || videoUrl === 'null') {
      console.log('🎬 No video URL, showing placeholder');
      // Keep the aspect ratio and show placeholder
      videoSection.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #000; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <div style="width: 80px; height: 80px; margin-bottom: 1rem; opacity: 0.5;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="80" height="80">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3 style="margin: 0 0 1rem; font-size: 1.5rem;">No Video Available</h3>
          <p style="margin: 0; opacity: 0.8;">Upload a video file in Shopify Admin</p>
          <p style="margin: 0.5rem 0 0; font-size: 0.875rem; opacity: 0.6;">Content → Metaobjects → Shoppable Videos → Edit "${videoTitle}"</p>
        </div>
      `;
      videoSection.classList.add('loaded');
    } else {
      console.log('🎬 Setting up video player with preload to prevent CLS');

      // Create video element with fixed dimensions
      videoSection.innerHTML = '<video class="shoppable-videos-v2-modal__player" controls playsinline muted preload="auto"></video>';

      // Update reference to new video player
      this.videoPlayer = videoSection.querySelector('.shoppable-videos-v2-modal__player');

      if (this.videoPlayer) {
        // Set video source
        this.videoPlayer.src = videoUrl;
        this.videoPlayer.setAttribute('aria-label', videoTitle || 'Video');

        // Handle loading states to prevent CLS
        this.videoPlayer.addEventListener('loadstart', () => {
          console.log('🎬 Video loading started');
        });

        this.videoPlayer.addEventListener('loadedmetadata', () => {
          console.log('🎬 Video metadata loaded');
          videoSection.classList.add('loaded');

          // Attempt autoplay
          this.videoPlayer.play().then(() => {
            console.log('🎬 Autoplay successful');
          }).catch(e => {
            console.log('🎬 Autoplay prevented:', e);
          });
        });

        this.videoPlayer.addEventListener('canplay', () => {
          console.log('🎬 Video can start playing');
          videoSection.classList.add('loaded');
        });

        this.videoPlayer.addEventListener('error', (e) => {
          console.error('🎬 Video error:', e);
          videoSection.classList.add('loaded');
          videoSection.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #000; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center;">
              <h3 style="margin: 0 0 1rem;">Error loading video</h3>
              <p style="opacity: 0.8;">Please try again later</p>
            </div>
          `;
        });

        // Fallback: try to play after a short delay
        setTimeout(() => {
          if (this.videoPlayer.paused && this.videoPlayer.readyState >= 2) {
            this.videoPlayer.play().catch(e => console.log('🎬 Delayed autoplay failed:', e));
          }
        }, 1000);
      }
    }
  }

  closeModal() {
    console.log('🎬 Closing modal');
    this.modal.classList.remove('active');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Reset video
    if (this.videoPlayer) {
      this.videoPlayer.pause();
      this.videoPlayer.currentTime = 0;
      this.videoPlayer.src = '';
    }

    // Clear products
    this.productsTrack.innerHTML = '';
  }

  loadProducts(videoId) {
    console.log('🎬 Loading products for:', videoId);

    // Clear existing products
    this.productsTrack.innerHTML = '';

    // Find products data
    const productsScript = document.querySelector(`script[data-products-for="${videoId}"]`);

    if (!productsScript) {
      this.productsTrack.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No products linked to this video.</div>';
      return;
    }

    try {
      const products = JSON.parse(productsScript.textContent);
      console.log('🎬 Products found:', products.length);

      if (products.length === 0) {
        this.productsTrack.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No products available for this video.</div>';
        return;
      }

      // Create enhanced product cards
      products.forEach(product => {
        const card = this.createProductCard(product);
        this.productsTrack.appendChild(card);
      });

    } catch (error) {
      console.error('🎬 Error parsing products:', error);
      this.productsTrack.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">Error loading products.</div>';
    }
  }

  createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'shoppable-product-card-v2';

    const imageHtml = product.image
      ? `<img src="${product.image}" alt="${product.title}" loading="lazy">`
      : `<div style="display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999;">No Image</div>`;

    const comparePrice = product.compare_at_price && product.compare_at_price !== product.price
      ? `<span class="shoppable-product-card-v2__price-compare">${product.compare_at_price}</span>`
      : '';

    const buttonText = product.available ? 'Add to Cart' : 'Sold Out';
    const buttonDisabled = product.available ? '' : 'disabled';

    card.innerHTML = `
      <div class="shoppable-product-card-v2__image">
        ${imageHtml}
      </div>
      <div class="shoppable-product-card-v2__content">
        <h4 class="shoppable-product-card-v2__title">${product.title}</h4>
        <div class="shoppable-product-card-v2__price">
          <span class="shoppable-product-card-v2__price-current">${product.price}</span>
          ${comparePrice}
        </div>
        <button
          class="shoppable-product-card-v2__button"
          data-variant-id="${product.variant_id}"
          data-product-handle="${product.handle}"
          ${buttonDisabled}
        >
          ${buttonText}
        </button>
      </div>
    `;

    // Enhanced add to cart functionality
    const addToCartBtn = card.querySelector('.shoppable-product-card-v2__button');
    if (addToCartBtn && product.available) {
      addToCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addToCart(product.variant_id, addToCartBtn);
      });
    }

    return card;
  }

  async addToCart(variantId, button) {
    const originalText = button.textContent;
    button.textContent = 'Adding...';
    button.disabled = true;

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          id: variantId,
          quantity: 1
        })
      });

      if (response.ok) {
        button.textContent = '✓ Added!';
        button.style.background = '#10B981';

        // Update cart count if exists
        this.updateCartCount();

        // Trigger cart drawer if exists
        if (window.CartDrawer && window.CartDrawer.open) {
          window.CartDrawer.open();
        }

        // Reset button after delay
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
          button.disabled = false;
        }, 2000);

        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('cart:added', {
          detail: { variantId, button }
        }));

      } else {
        throw new Error('Failed to add to cart');
      }
    } catch (error) {
      console.error('🎬 Error adding to cart:', error);
      button.textContent = 'Error';
      button.style.background = '#EF4444';

      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
        button.disabled = false;
      }, 2000);
    }
  }

  async updateCartCount() {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      const countElements = document.querySelectorAll('.cart-count, .cart-count-bubble');
      countElements.forEach(element => {
        element.textContent = cart.item_count;
        if (cart.item_count > 0) {
          element.classList.remove('hidden');
        }
      });
    } catch (error) {
      console.error('🎬 Error updating cart count:', error);
    }
  }
}

// Initialize V2 sections
function initShoppableVideosV2() {
  const sections = document.querySelectorAll('.section-shoppable-videos-v2');
  console.log('🎬 Found', sections.length, 'V2 sections');

  sections.forEach(section => {
    if (section.hasAttribute('data-v2-initialized')) return;

    section.setAttribute('data-v2-initialized', 'true');
    new ShoppableVideosV2(section);
  });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShoppableVideosV2);
} else {
  initShoppableVideosV2();
}

// Re-initialize for theme editor
if (typeof Shopify !== 'undefined' && Shopify.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.classList.contains('section-shoppable-videos-v2')) {
      new ShoppableVideosV2(event.target);
    }
  });
}

// For manual testing
window.testShoppableVideosV2 = function() {
  console.log('🎬 Testing V2...');
  const sections = document.querySelectorAll('.section-shoppable-videos-v2');
  const triggers = document.querySelectorAll('.shoppable-videos-v2__trigger');
  const modals = document.querySelectorAll('.shoppable-videos-v2-modal');

  return {
    sections: sections.length,
    triggers: triggers.length,
    modals: modals.length
  };
};