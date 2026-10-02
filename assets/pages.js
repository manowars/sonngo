/* Blog + gallery behaviour: filter chips, reading-time labels, gallery
   lightbox, and muted autoplay for gallery videos while they are on screen. */
(function () {
  'use strict';
  var t = function (k, v) { return window.i18n ? window.i18n.t(k, v) : k; };

  // Filter chips: <div class="chips" data-target="#list" data-key="lang"> filters
  // children of #list by their data-lang value.
  document.querySelectorAll('.chips[data-target]').forEach(function (group) {
    var list = document.querySelector(group.getAttribute('data-target'));
    var key = group.getAttribute('data-key');
    if (!list) return;
    group.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]');
      if (!b) return;
      var v = b.getAttribute('data-value');
      group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      list.querySelectorAll('[data-' + key + ']').forEach(function (el) {
        el.hidden = v !== 'all' && el.getAttribute('data-' + key) !== v;
      });
    });
  });

  function readingTimes() {
    document.querySelectorAll('[data-rt]').forEach(function (el) {
      el.textContent = t('blog.minRead', { n: el.getAttribute('data-rt') });
    });
  }
  document.addEventListener('langchange', readingTimes);

  // Gallery videos play only while visible (and never with reduced motion).
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vids = document.querySelectorAll('.g-item video');
  if (vids.length && !still && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
        else e.target.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  }

  // Lightbox
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var mediaBox = lb.querySelector('.lb-media');
  var capBox = lb.querySelector('.lb-cap');
  var closeBtn = lb.querySelector('.lb-close');
  var opener = null;

  function open(item) {
    opener = item;
    mediaBox.textContent = '';
    var video = item.getAttribute('data-video');
    var el;
    if (video) {
      el = document.createElement('video');
      el.src = video;
      el.controls = true; el.loop = true; el.playsInline = true; el.autoplay = true;
      var poster = item.getAttribute('data-full');
      if (poster) el.poster = poster;
    } else {
      el = document.createElement('img');
      el.src = item.getAttribute('data-full');
      el.alt = item.getAttribute('data-caption') || '';
    }
    mediaBox.appendChild(el);
    capBox.textContent = item.getAttribute('data-caption') || '';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    lb.hidden = true;
    mediaBox.textContent = '';
    document.body.style.overflow = '';
    if (opener) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var item = e.target.closest('.g-item');
    if (item) { open(item); return; }
    if (!lb.hidden && (e.target === lb || e.target === closeBtn)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lb.hidden) close();
  });
})();
