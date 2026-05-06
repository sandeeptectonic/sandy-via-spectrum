// Debug version - simpler implementation
console.log('🎬 Debug script loaded');

document.addEventListener('DOMContentLoaded', function() {
  console.log('🎬 DOM loaded, looking for video sections...');

  const sections = document.querySelectorAll('.section-shoppable-videos');
  console.log('🎬 Found sections:', sections.length);

  sections.forEach(function(section, index) {
    console.log('🎬 Processing section', index, section);
    console.log('🎬 Section HTML:', section.outerHTML.substring(0, 200) + '...');

    const triggers = section.querySelectorAll('.shoppable-videos__trigger');
    console.log('🎬 Found triggers in section', index, ':', triggers.length);

    const shoppableVideosDiv = section.querySelector('.shoppable-videos');
    console.log('🎬 Shoppable videos div:', shoppableVideosDiv);

    const modalId = shoppableVideosDiv ? shoppableVideosDiv.id + '-modal' : null;
    const modal = modalId ? document.getElementById(modalId) : null;
    console.log('🎬 Modal ID:', modalId, 'Modal element:', modal);

    // Also check if modal exists anywhere
    const allModals = document.querySelectorAll('.shoppable-videos-modal');
    console.log('🎬 All modals on page:', allModals.length);

    triggers.forEach(function(trigger, triggerIndex) {
      console.log('🎬 Adding click listener to trigger', triggerIndex);

      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('🎬 CLICK DETECTED on trigger', triggerIndex);
        console.log('🎬 Trigger data:', {
          videoUrl: trigger.dataset.videoUrl,
          videoTitle: trigger.dataset.videoTitle,
          videoId: trigger.dataset.videoId,
          noVideo: trigger.dataset.noVideo
        });

        if (modal) {
          console.log('🎬 Opening modal...');
          modal.classList.add('active');
          modal.style.display = 'block';
          document.body.style.overflow = 'hidden';

          // Test alert to confirm click is working
          alert('Click detected! Modal should be opening...');
        } else {
          console.error('🎬 Modal not found!', modalId);
          alert('Modal not found: ' + modalId);
        }
      });
    });

    // Add close functionality
    if (modal) {
      const closeButton = modal.querySelector('.shoppable-videos-modal__close');
      const backdrop = modal.querySelector('.shoppable-videos-modal__backdrop');

      if (closeButton) {
        closeButton.addEventListener('click', function() {
          console.log('🎬 Closing modal via close button');
          modal.classList.remove('active');
          modal.style.display = 'none';
          document.body.style.overflow = '';
        });
      }

      if (backdrop) {
        backdrop.addEventListener('click', function() {
          console.log('🎬 Closing modal via backdrop');
          modal.classList.remove('active');
          modal.style.display = 'none';
          document.body.style.overflow = '';
        });
      }
    }
  });
});

// Test function to call from console
window.testShoppableVideos = function() {
  console.log('🎬 Testing...');
  const sections = document.querySelectorAll('.section-shoppable-videos');
  const triggers = document.querySelectorAll('.shoppable-videos__trigger');
  const modals = document.querySelectorAll('.shoppable-videos-modal');

  console.log('Sections found:', sections.length);
  console.log('Triggers found:', triggers.length);
  console.log('Modals found:', modals.length);

  if (triggers.length > 0) {
    console.log('First trigger:', triggers[0]);
    console.log('First trigger dataset:', triggers[0].dataset);
  }

  return {
    sections: sections.length,
    triggers: triggers.length,
    modals: modals.length
  };
};