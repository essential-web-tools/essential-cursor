/*!
 * Essential Cursor FX (optional add-on, vanilla JS, zero dependencies)
 * ---------------------------------------------------------------------
 * The native OS cursor (CSS `cursor: url(...)`) is a static image — no
 * browser can animate it (no loops, no continuous squish, no shake
 * detection). This module is the only way to get REAL continuous
 * animation: it replaces the native cursor with a DOM element that
 * follows the pointer and reacts with CSS keyframe animations.
 *
 * 100% opt-in. If you never add [data-cursor-fx] to <html>, this file
 * does nothing. The base library (essential-cursors.css) keeps working
 * with zero JavaScript as usual.
 *
 * Usage:
 *   <html data-cursor-fx="jelly">   <!-- or data-cursor-fx="genie" -->
 *   <script src="essential-cursor-fx.js"></script>
 *
 * Everything below is editable. Change CONFIG and reload — no rebuild
 * step needed (this file is plain, unminified JS on purpose).
 * ---------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ===========================================================================
  // CONFIG — edit freely
  // ===========================================================================
  var CONFIG = {
    // 'jelly' = soft elastic squish on click. 'genie' = stretch/skew like
    // being sucked into a point. Overridden by [data-cursor-fx="..."] if set.
    style: 'jelly',

    size: 34, // px, visual size of the FX cursor

    colorLight: '#000000', // solid color used on light backgrounds
    colorDark: '#ffffff',  // solid color used when [data-theme="dark"] / [data-cursor-theme="dark"]

    entrance: {
      durationMs: 320,
    },

    click: {
      durationMs: 260,
    },

    wait: {
      // Hourglass-style wobble: rocks side to side in a loop while
      // hovering an element with `cursor: wait` or `cursor: progress`.
      wobbleDurationMs: 900,
    },

    drag: {
      // Continuous squish/stretch pulse while a mouse button is held
      // down and the pointer is moving.
      pulseDurationMs: 500,
    },

    shake: {
      // "Shake to find the cursor" (iOS-style): rapid left-right
      // direction reversals make the cursor grow then shrink back.
      reversalsToTrigger: 5,  // how many direction flips within resetMs
      resetMs: 500,           // time window for counting flips
      durationMs: 320,
    },
  };

  function init(userConfig) {
    var html = document.documentElement;
    if (html.hasAttribute('data-ec-fx-active')) return; // avoid double-init
    html.setAttribute('data-ec-fx-active', '');

    var config = Object.assign({}, CONFIG, userConfig || {});
    var attrStyle = html.getAttribute('data-cursor-fx');
    var style = (attrStyle === 'genie' || attrStyle === 'jelly') ? attrStyle : config.style;

    injectStyles(config);

    var outer = document.createElement('div');
    outer.className = 'ec-fx-cursor';
    outer.setAttribute('aria-hidden', 'true');

    var inner = document.createElement('div');
    inner.className = 'ec-fx-cursor-inner ec-fx-' + style;
    outer.appendChild(inner);
    document.body.appendChild(outer);

    html.classList.add('ec-fx-active');

    var entered = false;
    var dragging = false;
    var lastX = null, lastY = null, lastDX = 0, reversals = 0, lastReversalTime = 0;
    var clickTimer = null, shakeTimer = null;

    function onMove(e) {
      var x = e.clientX, y = e.clientY;
      outer.style.transform = 'translate(' + x + 'px,' + y + 'px)';

      if (!entered) {
        entered = true;
        inner.classList.add('ec-fx-enter-anim');
        setTimeout(function () { inner.classList.remove('ec-fx-enter-anim'); }, config.entrance.durationMs);
      }

      if (lastX !== null) {
        var dx = x - lastX;
        if (dx !== 0 && lastDX !== 0 && Math.sign(dx) !== Math.sign(lastDX)) {
          var now = performance.now();
          if (now - lastReversalTime < config.shake.resetMs) {
            reversals++;
          } else {
            reversals = 1;
          }
          lastReversalTime = now;
          if (reversals >= config.shake.reversalsToTrigger) {
            reversals = 0;
            triggerShake();
          }
        }
        if (dx !== 0) lastDX = dx;
      }
      lastX = x; lastY = y;

      if (dragging) inner.classList.add('ec-fx-drag');

      // Read the *declarative* CSS `cursor` of whatever is under the
      // pointer, so authors keep using normal `cursor: wait` / `grab` /
      // etc. in their own CSS — this script just visualizes it.
      var target = document.elementFromPoint(x, y);
      var computed = target ? getComputedStyle(target).cursor : 'auto';
      inner.classList.toggle('ec-fx-wait', computed === 'wait' || computed === 'progress');
      inner.classList.toggle('ec-fx-grab', computed === 'grab' || computed === 'grabbing');
    }

    function triggerShake() {
      clearTimeout(shakeTimer);
      inner.classList.remove('ec-fx-shake');
      // force reflow so the animation restarts if triggered again quickly
      void inner.offsetWidth;
      inner.classList.add('ec-fx-shake');
      shakeTimer = setTimeout(function () { inner.classList.remove('ec-fx-shake'); }, config.shake.durationMs);
    }

    function onDown() {
      dragging = true;
      inner.classList.add('ec-fx-down');
    }

    function onUp() {
      dragging = false;
      inner.classList.remove('ec-fx-down', 'ec-fx-drag');
      clearTimeout(clickTimer);
      inner.classList.remove('ec-fx-click');
      void inner.offsetWidth;
      inner.classList.add('ec-fx-click');
      clickTimer = setTimeout(function () { inner.classList.remove('ec-fx-click'); }, config.click.durationMs);
    }

    function onLeaveWindow() {
      outer.style.opacity = '0';
    }
    function onEnterWindow() {
      outer.style.opacity = '1';
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeaveWindow);
    document.addEventListener('mouseenter', onEnterWindow);

    window.EssentialCursorFX = {
      config: config,
      style: style,
      element: outer,
      destroy: function () {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        document.removeEventListener('mouseleave', onLeaveWindow);
        document.removeEventListener('mouseenter', onEnterWindow);
        outer.remove();
        html.classList.remove('ec-fx-active');
        html.removeAttribute('data-ec-fx-active');
      },
    };
  }

  function injectStyles(config) {
    var css = ''
      + 'html.ec-fx-active, html.ec-fx-active * { cursor: none !important; }'
      + '.ec-fx-cursor { position: fixed; top: 0; left: 0; width: 0; height: 0;'
      + ' pointer-events: none; z-index: 2147483647; will-change: transform; transition: opacity .15s ease; }'
      + '.ec-fx-cursor-inner { position: absolute; left: -6px; top: -4px;'
      + ' width: ' + config.size + 'px; height: ' + config.size + 'px;'
      + ' background-color: ' + config.colorLight + ';'
      + ' clip-path: polygon(0 0, 0 70%, 25% 55%, 42% 100%, 56% 92%, 40% 52%, 72% 50%);'
      + ' transform-origin: 15% 15%; transition: background-color .15s ease, transform .12s ease-out; }'
      + '[data-theme="dark"] .ec-fx-cursor-inner, [data-cursor-theme="dark"] .ec-fx-cursor-inner {'
      + ' background-color: ' + config.colorDark + '; }'

      // entrance
      + '@keyframes ec-fx-pop { 0% { transform: scale(0) rotate(-24deg); opacity: 0; }'
      + ' 60% { transform: scale(1.15) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }'
      + '.ec-fx-cursor-inner.ec-fx-enter-anim { animation: ec-fx-pop ' + config.entrance.durationMs + 'ms cubic-bezier(.34,1.56,.64,1); }'

      // jelly click (soft elastic squish)
      + '.ec-fx-jelly.ec-fx-down { transform: scale(1.18,.72) !important; }'
      + '@keyframes ec-fx-jelly-click { 0% { transform: scale(1.18,.72); } 40% { transform: scale(.74,1.28); }'
      + ' 70% { transform: scale(1.1,.9); } 100% { transform: scale(1,1); } }'
      + '.ec-fx-jelly.ec-fx-click { animation: ec-fx-jelly-click ' + config.click.durationMs + 'ms cubic-bezier(.36,2,.4,1); }'
      + '@keyframes ec-fx-jelly-drag { from { transform: scale(1.12,.86); } to { transform: scale(.9,1.1); } }'
      + '.ec-fx-jelly.ec-fx-drag { animation: ec-fx-jelly-drag ' + config.drag.pulseDurationMs + 'ms ease-in-out infinite alternate; }'

      // genie click (stretch/skew like sucked into a point)
      + '.ec-fx-genie.ec-fx-down { transform: scale(.55,1.45) skewX(-16deg) !important; }'
      + '@keyframes ec-fx-genie-click { 0% { transform: scale(.5,1.5) skewX(-18deg); }'
      + ' 55% { transform: scale(1.22,.68) skewX(8deg); } 100% { transform: scale(1,1) skewX(0); } }'
      + '.ec-fx-genie.ec-fx-click { animation: ec-fx-genie-click ' + config.click.durationMs + 'ms ease-out; }'
      + '@keyframes ec-fx-genie-drag { from { transform: scale(.82,1.22) skewX(-6deg); } to { transform: scale(1.12,.86) skewX(6deg); } }'
      + '.ec-fx-genie.ec-fx-drag { animation: ec-fx-genie-drag ' + config.drag.pulseDurationMs + 'ms ease-in-out infinite alternate; }'

      // wait: hourglass-style wobble, side to side, in loop
      + '@keyframes ec-fx-wait-wobble { 0%, 100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }'
      + '.ec-fx-cursor-inner.ec-fx-wait { animation: ec-fx-wait-wobble ' + config.wait.wobbleDurationMs + 'ms ease-in-out infinite; }'

      // shake to grow (iOS-style)
      + '@keyframes ec-fx-shake-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.55); } 100% { transform: scale(1); } }'
      + '.ec-fx-cursor-inner.ec-fx-shake { animation: ec-fx-shake-pulse ' + config.shake.durationMs + 'ms ease-out; }'

      // grab state (bonus, matches the library's grab/grabbing cursors)
      + '.ec-fx-cursor-inner.ec-fx-grab { transform: scale(.92); }';

    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-ec-fx-styles', '');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Auto-init if [data-cursor-fx] is present on <html>. Otherwise, call
  // `EssentialCursorFXInit(config)` manually whenever you want.
  window.EssentialCursorFXInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  function autoInit() {
    if (document.documentElement.hasAttribute('data-cursor-fx')) init();
  }
})();
