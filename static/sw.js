// Install event
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

// Fetch listener - INI SYARAT WAJIB DARI CHROME
self.addEventListener('fetch', function(event) {
});