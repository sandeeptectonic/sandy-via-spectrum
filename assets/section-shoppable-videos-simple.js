// Simple, guaranteed to work version
console.log('🔥 Simple shoppable videos script loaded');

function initShoppableVideos() {
  console.log('🔥 Initializing shoppable videos...');

  // Find all video triggers
  const triggers = document.querySelectorAll('.shoppable-videos__trigger');
  const modals = document.querySelectorAll('.shoppable-videos-modal');

  console.log('🔥 Found triggers:', triggers.length);
  console.log('🔥 Found modals:', modals.length);

  triggers.forEach((trigger, index) => {
    console.log('🔥 Setting up trigger', index);

    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🔥 CLICK! Trigger clicked:', index);

      // Find the closest section
      const section = trigger.closest('.section-shoppable-videos');
      if (!section) {
        console.error('🔥 No section found');
        return;
      }

      // Find modal ID from section
      const sectionInner = section.querySelector('.shoppable-videos');
      if (!sectionInner) {
        console.error('🔥 No inner section found');
        return;
      }

      const modalId = sectionInner.id + '-modal';
      const modal = document.getElementById(modalId);

      console.log('🔥 Looking for modal:', modalId);
      console.log('🔥 Modal found:', modal);

      if (!modal) {
        alert('Modal not found: ' + modalId);
        return;
      }

      // Get data
      const videoUrl = trigger.getAttribute('data-video-url');
      const videoTitle = trigger.getAttribute('data-video-title');
      const videoId = trigger.getAttribute('data-video-id');

      console.log('🔥 Video data:', { videoUrl, videoTitle, videoId });

      // Show modal
      modal.classList.add('active');
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';

      // Handle video
      const videoPlayer = modal.querySelector('.shoppable-videos-modal__player');
      const videoSection = modal.querySelector('.shoppable-videos-modal__video');

      if (videoUrl && videoUrl.trim() && videoUrl !== 'null') {
        console.log('🔥 Setting video source:', videoUrl);
        if (videoPlayer) {
          videoPlayer.src = videoUrl;
          videoPlayer.muted = true; // Mute for autoplay to work
          videoPlayer.playsInline = true; // Better mobile support

          // Wait for video to be ready then play
          videoPlayer.addEventListener('loadedmetadata', () => {
            console.log('🔥 Video metadata loaded, attempting autoplay...');
            videoPlayer.play().then(() => {
              console.log('🔥 Autoplay successful');
            }).catch(e => {
              console.log('🔥 Autoplay prevented:', e);
              console.log('🔥 Video will require user interaction to play');
            });
          });

          // Fallback: try to play immediately as well
          setTimeout(() => {
            if (videoPlayer.paused) {
              videoPlayer.play().catch(e => console.log('🔥 Delayed play attempt failed:', e));
            }
          }, 500);
        }
      } else {
        console.log('🔥 No video URL, showing placeholder');
        if (videoSection) {
          videoSection.innerHTML = `
            <div style="background: #000; color: white; padding: 2rem; text-align: center; min-height: 300px; display: flex; flex-direction: column; justify-content: center;">
              <h3>No Video Available</h3>
              <p>Upload a video file in Shopify Admin</p>
              <p><small>Content → Metaobjects → Shoppable Videos → Edit "${videoTitle}"</small></p>
            </div>
          `;
        }
      }

      // Load products
      loadProducts(videoId, modal);
    });
  });

  // Close modal functionality
  modals.forEach(modal => {
    const closeBtn = modal.querySelector('.shoppable-videos-modal__close');
    const backdrop = modal.querySelector('.shoppable-videos-modal__backdrop');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal(modal));
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => closeModal(modal));
    }
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modals.forEach(modal => {
        if (modal.classList.contains('active')) {
          closeModal(modal);
        }
      });
    }
  });
}

function closeModal(modal) {
  console.log('🔥 Closing modal');
  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';

  // Reset video
  const videoPlayer = modal.querySelector('.shoppable-videos-modal__player');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = '';
  }

  // Reset video section
  const videoSection = modal.querySelector('.shoppable-videos-modal__video');
  if (videoSection) {
    videoSection.innerHTML = '<video class="shoppable-videos-modal__player" controls playsinline muted preload="metadata"></video>';
  }
}

function loadProducts(videoId, modal) {
  console.log('🔥 Loading products for:', videoId);

  const productsGrid = modal.querySelector('.shoppable-videos-modal__products-grid');
  if (!productsGrid) {
    console.error('🔥 Products grid not found');
    return;
  }

  // Clear existing
  productsGrid.innerHTML = '';

  // Find products script
  const productsScript = document.querySelector(`script[data-products-for="${videoId}"]`);
  console.log('🔥 Products script:', productsScript);

  if (!productsScript) {
    productsGrid.innerHTML = '<p>No products linked to this video.</p>';
    return;
  }

  try {
    const products = JSON.parse(productsScript.textContent);
    console.log('🔥 Products found:', products.length);

    if (products.length === 0) {
      productsGrid.innerHTML = '<p>No products available for this video.</p>';
      return;
    }

    // Create product cards
    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'shoppable-product-card';

      card.innerHTML = `
        <div class="shoppable-product-card__image">
          ${product.image ? `<img src="${product.image}" alt="${product.title}" loading="lazy">` : '<div>No Image</div>'}
        </div>
        <div class="shoppable-product-card__info">
          <h4 class="shoppable-product-card__title">${product.title}</h4>
          <div class="shoppable-product-card__price">
            <span class="shoppable-product-card__price-current">${product.price}</span>
          </div>
          <button class="shoppable-product-card__button" ${!product.available ? 'disabled' : ''}>
            ${product.available ? 'Add to Cart' : 'Sold Out'}
          </button>
        </div>
      `;

      productsGrid.appendChild(card);

      // Add to cart functionality
      const button = card.querySelector('.shoppable-product-card__button');
      if (button && product.available) {
        button.addEventListener('click', () => {
          button.textContent = 'Adding...';
          button.disabled = true;

          fetch('/cart/add.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: product.variant_id,
              quantity: 1
            })
          })
          .then(response => response.json())
          .then(data => {
            button.textContent = 'Added!';
            setTimeout(() => {
              button.textContent = 'Add to Cart';
              button.disabled = false;
            }, 2000);
          })
          .catch(error => {
            console.error('Add to cart error:', error);
            button.textContent = 'Error';
            setTimeout(() => {
              button.textContent = 'Add to Cart';
              button.disabled = false;
            }, 2000);
          });
        });
      }
    });

  } catch (error) {
    console.error('🔥 Error parsing products:', error);
    productsGrid.innerHTML = '<p>Error loading products.</p>';
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShoppableVideos);
} else {
  initShoppableVideos();
}

// Also try after a small delay
setTimeout(initShoppableVideos, 1000);

// For testing
window.testShoppableVideos = function() {
  console.log('🔥 Testing...');
  const triggers = document.querySelectorAll('.shoppable-videos__trigger');
  const modals = document.querySelectorAll('.shoppable-videos-modal');
  console.log('Triggers:', triggers.length, 'Modals:', modals.length);
  return { triggers: triggers.length, modals: modals.length };
};