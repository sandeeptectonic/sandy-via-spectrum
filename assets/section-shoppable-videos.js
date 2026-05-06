class ShoppableVideos {
  constructor(section) {
    this.section = section;
    this.modal = document.getElementById(section.id + '-modal');
    this.modalBackdrop = this.modal.querySelector('.shoppable-videos-modal__backdrop');
    this.modalClose = this.modal.querySelector('.shoppable-videos-modal__close');
    this.videoPlayer = this.modal.querySelector('.shoppable-videos-modal__player');
    this.productsGrid = this.modal.querySelector('.shoppable-videos-modal__products-grid');
    this.triggers = section.querySelectorAll('.shoppable-videos__trigger');

    this.init();
  }

  init() {
    console.log('ShoppableVideos: Initializing with', this.triggers.length, 'video triggers');
    console.log('Modal element:', this.modal);

    // Add click handlers to video triggers
    this.triggers.forEach((trigger, index) => {
      console.log('Adding click handler to trigger', index, trigger.dataset);
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Video trigger clicked:', trigger.dataset);
        this.openModal(e);
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

  openModal(event) {
    const trigger = event.currentTarget;
    const videoUrl = trigger.dataset.videoUrl;
    const videoTitle = trigger.dataset.videoTitle;
    const videoId = trigger.dataset.videoId;
    const noVideo = trigger.dataset.noVideo === 'true';

    console.log('Opening modal with:', { videoUrl, videoTitle, videoId, noVideo });

    if (noVideo || !videoUrl || videoUrl.trim() === '' || videoUrl === 'null' || videoUrl === 'undefined') {
      console.warn('No video URL found, showing modal without video');
      // Still open the modal but show a placeholder for the video
      this.openModalWithoutVideo(videoTitle, videoId);
      return;
    }

    if (!this.modal) {
      console.error('Modal element not found');
      return;
    }

    console.log('Setting video source to:', videoUrl);
    console.log('Video player element:', this.videoPlayer);

    // Set video source and title
    this.videoPlayer.src = videoUrl;
    this.videoPlayer.setAttribute('aria-label', videoTitle || 'Video');

    // Load products
    this.loadProducts(videoId);

    // Show modal
    this.modal.classList.add('active');
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Auto-play video with better error handling
    console.log('Attempting to play video...');
    const playPromise = this.videoPlayer.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('Video autoplay started successfully');
        })
        .catch(error => {
          console.log('Autoplay was prevented:', error);
          console.log('Video element state:', {
            src: this.videoPlayer.src,
            readyState: this.videoPlayer.readyState,
            networkState: this.videoPlayer.networkState
          });
        });
    }

    // Focus management
    if (this.modalClose) {
      this.modalClose.focus();
    }
  }

  openModalWithoutVideo(videoTitle, videoId) {
    if (!this.modal) {
      console.error('Modal element not found');
      return;
    }

    // Hide the video section and show a placeholder
    const videoSection = this.modal.querySelector('.shoppable-videos-modal__video');
    if (videoSection) {
      videoSection.innerHTML = `
        <div class="shoppable-videos-modal__no-video">
          <div class="shoppable-videos-modal__no-video-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3>No Video Available</h3>
          <p>Upload a video file in your Shopify Admin to see it here.</p>
          <p><small>Content → Metaobjects → Shoppable Videos → Edit "${videoTitle}"</small></p>
        </div>
      `;
    }

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

  closeModal() {
    // Hide modal
    this.modal.classList.remove('active');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Reset video section
    const videoSection = this.modal.querySelector('.shoppable-videos-modal__video');
    if (videoSection) {
      videoSection.innerHTML = '<video class="shoppable-videos-modal__player" controls playsinline></video>';
      // Update reference to new video player
      this.videoPlayer = videoSection.querySelector('.shoppable-videos-modal__player');
    }

    // Stop and reset video if it exists
    if (this.videoPlayer) {
      this.videoPlayer.pause();
      this.videoPlayer.currentTime = 0;
      this.videoPlayer.src = '';
    }

    // Clear products
    this.productsGrid.innerHTML = '';
  }

  loadProducts(videoId) {
    // Clear existing products
    this.productsGrid.innerHTML = '';

    console.log('Loading products for videoId:', videoId);

    // Find products data
    const productsScript = document.querySelector(`script[data-products-for="${videoId}"]`);
    console.log('Products script found:', productsScript);

    if (!productsScript) {
      console.log('No products script found for', videoId);
      this.productsGrid.innerHTML = '<p>No products linked to this video.</p>';
      return;
    }

    try {
      const products = JSON.parse(productsScript.textContent);

      if (products.length === 0) {
        this.productsGrid.innerHTML = '<p>No products available for this video.</p>';
        return;
      }

      // Create product cards
      products.forEach(product => {
        const card = this.createProductCard(product);
        this.productsGrid.appendChild(card);
      });
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'shoppable-product-card';

    const imageHtml = product.image
      ? `<img src="${product.image}" alt="${product.title}" loading="lazy">`
      : `<div class="shoppable-product-card__no-image">No Image</div>`;

    const comparePrice = product.compare_at_price && product.compare_at_price !== product.price
      ? `<span class="shoppable-product-card__price-compare">${product.compare_at_price}</span>`
      : '';

    const buttonText = product.available ? 'Add to Cart' : 'Sold Out';
    const buttonDisabled = product.available ? '' : 'disabled';

    card.innerHTML = `
      <div class="shoppable-product-card__image">
        ${imageHtml}
      </div>
      <div class="shoppable-product-card__info">
        <h4 class="shoppable-product-card__title">${product.title}</h4>
        <div class="shoppable-product-card__price">
          <span class="shoppable-product-card__price-current">${product.price}</span>
          ${comparePrice}
        </div>
        <button
          class="shoppable-product-card__button"
          data-variant-id="${product.variant_id}"
          data-product-handle="${product.handle}"
          ${buttonDisabled}
        >
          ${buttonText}
        </button>
      </div>
    `;

    // Add click handler for add to cart button
    const addToCartBtn = card.querySelector('.shoppable-product-card__button');
    if (addToCartBtn && product.available) {
      addToCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addToCart(product.variant_id, addToCartBtn);
      });
    }

    return card;
  }

  async addToCart(variantId, button) {
    // Disable button and show loading state
    const originalText = button.textContent;
    button.textContent = 'Adding...';
    button.disabled = true;

    try {
      const response = await fetch(window.Shopify.routes.root + 'cart/add.js', {
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
        const data = await response.json();

        // Update button
        button.textContent = 'Added!';

        // Update cart count if exists
        this.updateCartCount();

        // Trigger cart drawer if exists
        if (window.CartDrawer && window.CartDrawer.open) {
          window.CartDrawer.open();
        }

        // Reset button after delay
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);

        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('cart:added', {
          detail: { item: data }
        }));
      } else {
        throw new Error('Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      button.textContent = 'Error';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  }

  async updateCartCount() {
    try {
      const response = await fetch(window.Shopify.routes.root + 'cart.js');
      const cart = await response.json();

      // Update cart count elements
      const countElements = document.querySelectorAll('.cart-count, .cart-count-bubble');
      countElements.forEach(element => {
        element.textContent = cart.item_count;

        // Show/hide bubble based on count
        if (cart.item_count > 0) {
          element.classList.remove('hidden');
        }
      });
    } catch (error) {
      console.error('Error updating cart count:', error);
    }
  }
}

// Initialize for each section on the page
function initializeShoppableVideos() {
  const sections = document.querySelectorAll('.section-shoppable-videos');
  console.log('Found', sections.length, 'shoppable video sections');

  sections.forEach(section => {
    // Prevent double initialization
    if (section.hasAttribute('data-shoppable-videos-initialized')) {
      return;
    }

    section.setAttribute('data-shoppable-videos-initialized', 'true');
    new ShoppableVideos(section);
  });
}

document.addEventListener('DOMContentLoaded', initializeShoppableVideos);

// Also try immediate initialization in case DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeShoppableVideos);
} else {
  initializeShoppableVideos();
}

// Re-initialize on section load (for theme editor)
if (typeof Shopify !== 'undefined' && Shopify.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.classList.contains('section-shoppable-videos')) {
      new ShoppableVideos(event.target);
    }
  });
}