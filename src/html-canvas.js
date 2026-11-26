/*

    html-canvas.js

    an experimental HTML-in-Canvas bridge for morphic.js

    written by Michael Ball and contributors

    Copyright (C) 2026 by Michael Ball / the Snap! team

    This file is part of Snap!.

    Snap! is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of
    the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.


    overview
    --------
    HTML-in-Canvas (https://github.com/WICG/html-in-canvas, Chrome 157+) lets
    a <canvas content="drawable"> lay out its DOM children and paint them
    with ctx.drawElementImage(), while the browser keeps their accessibility
    semantics, hit testing, focus and text editing alive at the drawn
    position.

    This module is an EVALUATION PROTOTYPE of what that means for Morphic.
    It is opt-in (see "turning it on" below), inert in browsers without the
    API, and built on top of accessibility.js. The write-up of what we
    learned is docs/HTML-IN-CANVAS.md.

    It does three things:

    1.  the parallel DOM moves INTO the canvas

        The overlay root that accessibility.js keeps beside the canvas
        becomes a drawable child of the canvas itself. Nothing else about
        the parallel tree changes - morphs still describe themselves and
        still own one element each - but the tree is now the canvas' own
        subtree, so elements that paint themselves can nest inside it.

    2.  HTMLMorph - a morph whose content IS a DOM element

        The element is laid out by the browser, measured to give the morph
        its extent, and drawn with drawElementImage() from the morph's
        normal render() call. The canvas "paint" event (the element looks
        different) maps onto Morphic's changed() damage list. Native
        controls inside it take pointer and keyboard input directly.
        Demo: the cloud "Sign in" / "Sign up" dialogs.

    3.  native text for StringMorphs

        A StringMorph can paint through a DOM text element instead of
        fillText(), so the words on a block are real, findable text at
        their real position. Demo: block labels and input slot contents.

    turning it on
    -------------
    Add a query parameter to the page URL:

        snap.html?html-in-canvas            everything
        snap.html?html-in-canvas=forms      only the HTML dialogs
        snap.html?html-in-canvas=text       only native block text
        snap.html?html-in-canvas=text-all   native text for every StringMorph

    or call world.enableHTMLInCanvas({forms: true, text: 'blocks'}).

*/

/*global Morph, WorldMorph, HandMorph, StringMorph, Color, Point, nop,
  localize, modules, document, window, location, DOMMatrix, ResizeObserver,
  DialogBoxMorph, BlockLabelMorph, InputSlotStringMorph, MorphicPreferences*/

/*jshint esversion: 11*/

// Global settings ////////////////////////////////////////////////////////

if (typeof modules !== 'undefined') {
    modules.htmlCanvas = '2026-11-26';
}

var HTMLMorph;

// feature detection + activation /////////////////////////////////////////

function supportsHTMLInCanvas() {
    // the detection recommended by the Chrome documentation: the "content"
    // attribute only reflects "drawable" where the API exists
    var canvas;
    if (typeof document === 'undefined') {return false; }
    canvas = document.createElement('canvas');
    canvas.setAttribute('content', 'drawable');
    return canvas.content === 'drawable' &&
        typeof canvas.getContext('2d').drawElementImage === 'function';
}

function requestedHTMLInCanvas() {
    // parse the opt-in query parameter, answer a features object or null
    var match = /[?&]html-in-canvas(?:=([^&#]*))?(?:[&#]|$)/.exec(
            (typeof location !== 'undefined' && location.search) || ''
        ),
        list;
    if (!match) {return null; }
    list = (match[1] || 'all').split(',');
    return {
        forms: list.includes('all') || list.includes('forms'),
        text: list.includes('text-all') ? 'all' :
                (list.includes('all') || list.includes('text')) ?
                    'blocks' : false
    };
}

// WorldMorph HTML-in-Canvas support //////////////////////////////////////

WorldMorph.prototype.htmlInCanvas = null; // features object once enabled
WorldMorph.prototype.hicMorphs = null; // Set of element-backed morphs
WorldMorph.prototype.hicForms = null; // Set of the interactive HTMLMorphs
WorldMorph.prototype.hicTextHost = null; // home of unstructured text nodes
WorldMorph.prototype.hicParking = null; // where elements wait for their morph

WorldMorph.prototype.hicStyle =
    // everything drawn into the canvas is styled explicitly: system colors
    // and themes are deliberately not painted by drawElementImage()
    '.morphic-text {' +
        // only the canvas' immediate children are blockified automatically
        'display: block; margin: 0; border: 0; box-sizing: border-box;' +
        'white-space: pre;' +
        'overflow: visible; pointer-events: none;' +
    '}' +
    '.morphic-html {' +
        'margin: 0; box-sizing: border-box; width: max-content;' +
        // only my border box gets drawn: leave room for focus outlines
        'padding: 3px; pointer-events: auto; opacity: 1; color: #000;' +
        'font: 10px/1.2 Verdana, Arial, sans-serif;' +
    '}' +
    '.morphic-html label, .morphic-html p {' +
        'display: block; margin: 0; padding: 4px 0 2px;' +
        'text-shadow: 1px 1px 0 #fff;' +
    '}' +
    '.morphic-html input[type=text], .morphic-html input[type=password],' +
    '.morphic-html input[type=email], .morphic-html select {' +
        'display: block; box-sizing: border-box; margin: 0; width: 200px;' +
        'padding: 2px 4px; font: 12px Verdana, Arial, sans-serif;' +
        'color: #000; background: #fff; border: 1px solid #7f7f7f;' +
        'border-radius: 3px;' +
    '}' +
    '.morphic-html select { width: auto; padding: 1px 2px; }' +
    '.morphic-html .row { display: flex; gap: 8px; }' +
    '.morphic-html .check {' +
        'display: flex; align-items: center; gap: 4px; padding-top: 8px;' +
    '}' +
    '.morphic-html .check input { margin: 0; accent-color: #2a62c9; }' +
    '.morphic-html .links { display: flex; gap: 12px; padding-top: 8px; }' +
    '.morphic-html a { color: #1a4fb3; }' +
    '.morphic-html .error {' +
        'max-width: 200px; padding: 6px 0 0; color: #a40000;' +
        'font-weight: bold; text-shadow: none;' +
    '}' +
    '.morphic-html .error:empty { display: none; }' +
    '.morphic-html [aria-invalid=true] { border-color: #a40000; }' +
    '.morphic-html :focus-visible {' +
        'outline: 2px solid rgb(0, 120, 255); outline-offset: 1px;' +
    '}';

WorldMorph.prototype.enableHTMLInCanvas = function (features) {
    // opt this world's canvas into HTML-in-Canvas. Answers true if the
    // browser supports it (and accessibility.js is active), else false -
    // in which case everything keeps rendering the classic way.
    var canvas = this.worldCanvas,
        root = this.a11yRoot,
        style;

    if (this.htmlInCanvas) {
        Object.assign(this.htmlInCanvas, features || {});
        this.changed();
        return true;
    }
    if (!root || !supportsHTMLInCanvas()) {
        return false;
    }
    this.htmlInCanvas = Object.assign(
        {forms: true, text: 'blocks'},
        features || {}
    );
    this.hicMorphs = new Set();
    this.hicForms = new Set();
    this.hicDirty = false;
    this.hicSweeps = 0;
    HTMLMorph.prototype.hostWorld = this; // where detached elements measure

    if (!document.getElementById('morphic-html-canvas-style')) {
        style = document.createElement('style');
        style.id = 'morphic-html-canvas-style';
        style.textContent = this.hicStyle;
        document.head.appendChild(style);
    }

    // 1. canvas children now take part in layout, and can be drawn
    canvas.setAttribute('content', 'drawable');
    canvas.hicWorld = this; // lets render() recognize the world canvas

    // 2. the parallel DOM becomes the canvas' own subtree: the root is a
    // drawable that is never painted, mapped 1:1 onto the canvas, so the
    // (absolutely positioned) nodes inside it keep their geometry exactly
    // as they had it in the overlay
    canvas.removeAttribute('aria-hidden');
    root.setAttribute('drawable', '');
    root.style.left = '';
    root.style.top = '';
    canvas.appendChild(root);

    // 3. a home for text that has no structured parent of its own (yet):
    // real text for find-in-page / selection, but kept out of the AT tree
    // so it isn't read as a loose soup of words
    this.hicTextHost = document.createElement('div');
    this.hicTextHost.setAttribute('aria-hidden', 'true');
    root.insertBefore(this.hicTextHost, root.firstChild);

    // ... and a place where an element can be laid out (so its morph can
    // measure it) before the morph is part of the world: inert, unseen
    this.hicParking = document.createElement('div');
    this.hicParking.setAttribute('aria-hidden', 'true');
    this.hicParking.inert = true;
    root.insertBefore(this.hicParking, root.firstChild);

    this.updateAccessibilityRoot();

    // 4. "this element now looks different" -> Morphic's damage list
    this._hicPaintListener = event => this.handleCanvasPaint(event);
    canvas.addEventListener('paint', this._hicPaintListener);

    // 5. remember whether - and which way - Tab is travelling, so an
    // HTMLMorph entered with Tab / Shift+Tab can focus its first / last
    // control (window capture runs before the accessibility layer's
    // document listener)
    this.hicTabDirection = 0;
    this._hicKeyListener = event => {
        this.hicTabDirection = event.key !== 'Tab' ? 0 :
                event.shiftKey ? -1 : 1;
    };
    this._hicPointerListener = () => this.hicTabDirection = 0;
    window.addEventListener('keydown', this._hicKeyListener, true);
    window.addEventListener('mousedown', this._hicPointerListener, true);

    // 6. housekeeping for elements whose morphs left the world or the view
    this._hicSweepTimer = window.setInterval(() => this.hicSweep(), 500);

    this.changed();
    return true;
};

WorldMorph.prototype.hicBaseInitAccessibility =
    WorldMorph.prototype.initAccessibility;

WorldMorph.prototype.initAccessibility = function () {
    var request = requestedHTMLInCanvas();
    this.hicBaseInitAccessibility();
    if (request) {
        this.enableHTMLInCanvas(request);
    }
};

WorldMorph.prototype.hicBaseUpdateAccessibilityRoot =
    WorldMorph.prototype.updateAccessibilityRoot;

WorldMorph.prototype.updateAccessibilityRoot = function () {
    // inside the canvas the root needs no document offset: its "canvas
    // element transform" (here: identity) says where it is
    var canvas = this.worldCanvas,
        root = this.a11yRoot;
    if (!this.htmlInCanvas) {
        return this.hicBaseUpdateAccessibilityRoot();
    }
    if (!root) {return; }
    root.style.width = canvas.clientWidth + 'px';
    root.style.height = canvas.clientHeight + 'px';
    canvas.updateElementGeometry(root, {
        canvasTransform: new DOMMatrix(),
        preserveHitTestOrder: true
    });
};

WorldMorph.prototype.handleCanvasPaint = function (event) {
    // the browser recorded a new snapshot of these elements. Damage their
    // morphs and repaint right away: canvas drawing done during the paint
    // event still lands in the current frame.
    var dirty = false;
    Array.from(event.changedElements || []).forEach(element => {
        var morph = element.hicMorph,
            root;
        if (!morph || !this.hicMorphs.has(morph)) {return; }
        element.hicReady = true;
        root = morph.root();
        if (root instanceof HandMorph) {
            root.changed(); // being dragged
        } else {
            morph.changed();
        }
        dirty = true;
    });
    if (dirty) {
        this.updateBroken();
    }
};

WorldMorph.prototype.hicSweep = function () {
    // drop the elements of morphs that are gone, and clear the geometry of
    // those that are no longer showing (a morph that isn't drawn can't
    // update its element's position, so it would keep claiming the old one)
    var canvas = this.worldCanvas;
    this.hicSweeps += 1;
    if (!this.hicDirty && this.hicSweeps % 4) {
        return; // nothing was drawn lately: only look every 2 seconds
    }
    this.hicDirty = false;
    this.hicMorphs.forEach(morph => {
        var element = morph.hicElement,
            root = morph.root();
        if (!element || element.hicMorph !== morph) {
            this.hicMorphs.delete(morph);
        } else if (!element.isConnected ||
                (root !== this && !(root instanceof HandMorph))) {
            // gone from the world - or its element went away together with
            // the node it was nested in. If the morph is ever drawn again
            // it gets (or re-homes) an element then.
            if (morph.releaseHTMLElement()) {
                this.hicMorphs.delete(morph);
            }
        } else if (element.hicHasGeometry && !morph.hicIsShowing()) {
            canvas.clearElementGeometry(element);
            element.hicHasGeometry = false;
        }
    });
};

// pointer events ---------------------------------------------------------

/*
    Once an element has been drawn it is hit-testable at its drawn position,
    so the browser dispatches pointer events to IT (they still bubble up to
    the canvas, where Morphic listens). Two rules keep both worlds happy:

    * isHTMLEvent() - called first thing by Morphic's canvas listeners
      (guarded hooks in morphic.js) - answers true for events aimed at a
      native control inside an interactive HTMLMorph. Morphic then leaves
      the event entirely to the browser.

    * the browser hit-tests elements without knowing which morphs are drawn
      on top of them, so on every mouse move we enable an HTMLMorph's
      pointer events only while it really is the topmost morph under the
      pointer (and never while something is being dragged).
*/

WorldMorph.prototype.hicNativeTargets = 'input, textarea, select, button, ' +
    'option, label, a[href], summary, [contenteditable=""], ' +
    '[contenteditable="true"]';

WorldMorph.prototype.isHTMLEvent = function (event) {
    var target = event.target,
        element,
        morph;
    if (!this.htmlInCanvas || target === this.worldCanvas ||
            !target || !target.closest) {
        return false;
    }
    element = target.closest('.morphic-html');
    morph = element ? element.hicMorph : null;
    if (!(morph instanceof HTMLMorph) || !morph.isInteractive ||
            !target.closest(this.hicNativeTargets)) {
        return false;
    }
    if (event.type === 'mousedown' || event.type === 'touchstart') {
        // what Morphic's own mouse-down would have tidied up
        this.hand.destroyTemporaries();
        this.hand.mouseButton = null;
        this.hand.morphToGrab = null;
        if (this.activeMenu) {
            this.activeMenu.destroy();
        }
        if (this.cursor) {
            this.stopEditing();
        }
    }
    return true;
};

WorldMorph.prototype.arbitrateHTMLHitTesting = function () {
    var hand = this.hand,
        dragging = hand.children.length > 0,
        top = null,
        known = false;
    this.hicForms.forEach(morph => {
        var on;
        if (!morph.isInteractive) {return; }
        if (!known) {
            top = hand.morphAtPointer();
            known = true;
        }
        on = !dragging && (top === morph ||
            !morph.bounds.containsPoint(hand.bounds.origin));
        if (morph.element.hicPointer !== on) {
            morph.element.hicPointer = on;
            morph.element.style.pointerEvents = on ? 'auto' : 'none';
        }
    });
};

HandMorph.prototype.hicBaseProcessMouseMove =
    HandMorph.prototype.processMouseMove;

HandMorph.prototype.processMouseMove = function (event) {
    this.hicBaseProcessMouseMove(event);
    if (this.world.htmlInCanvas) {
        this.world.arbitrateHTMLHitTesting();
    }
};

HandMorph.prototype.hicBaseGrab = HandMorph.prototype.grab;

HandMorph.prototype.grab = function (aMorph) {
    // the hand normally drags a bitmap of the morph it picked up, rendered
    // into an offscreen canvas - which an element can't be drawn into. A
    // morph that contains HTML is dragged "live" instead.
    this.hicBaseGrab(aMorph);
    if (this.world.htmlInCanvas && this.cachedFullBounds && aMorph &&
            aMorph.allChildren().some(m => m instanceof HTMLMorph)) {
        this.cachedFullImage = null;
        this.cachedFullBounds = null;
        this.world.arbitrateHTMLHitTesting();
        this.changed();
    }
};

// Morph element-backed rendering - shared helpers ////////////////////////

Morph.prototype.hicElement = null; // the DOM element I paint through

Morph.prototype.hicBaseCopy = Morph.prototype.copy;

Morph.prototype.copy = function () {
    // a copy must not share my element
    var c = this.hicBaseCopy();
    c.hicElement = null;
    return c;
};

Morph.prototype.hicIsShowing = function () {
    var visible;
    if (!this.a11yIsShowing()) {return false; }
    visible = this.visibleBounds();
    return visible.width() > 0 && visible.height() > 0;
};

Morph.prototype.releaseHTMLElement = function () {
    // I'm gone: remove my element. Answer whether it was released.
    var element = this.hicElement;
    if (element && element.hicMorph === this) {
        element.remove();
        element.hicMorph = null;
    }
    this.hicElement = null;
    return true;
};

// HTMLMorph //////////////////////////////////////////////////////////////

/*
    I am a morph whose content is a DOM element living inside the world
    canvas. The browser lays my element out and I take my extent from it;
    I paint it with drawElementImage(); when the browser says it looks
    different, I'm changed(). My element is also my node in the
    accessibility tree - there is nothing "parallel" about it any more.

    My element should size itself (the default style is width: max-content)
    and carry its own semantics (a <form>, labels, inputs, ...).

    Outside a world that has HTML-in-Canvas enabled I can't paint; use
    HTMLMorph.prototype.isAvailable(world) to pick a classic fallback.
*/

// HTMLMorph inherits from Morph:

HTMLMorph.prototype = new Morph();
HTMLMorph.prototype.constructor = HTMLMorph;
HTMLMorph.uber = Morph.prototype;

// HTMLMorph preferences settings:

HTMLMorph.prototype.hostWorld = null; // the world whose canvas hosts elements

// HTMLMorph instance creation:

function HTMLMorph(element) {
    this.init(element);
}

HTMLMorph.prototype.isAvailable = function (world) {
    return !!(world && world.htmlInCanvas);
};

HTMLMorph.prototype.init = function (element) {
    HTMLMorph.uber.init.call(this);
    this.color = new Color(0, 0, 0, 0);
    this.isInteractive = true; // native controls receive input
    this.isAccessible = true; // my element is my accessibility node
    this.element = element || document.createElement('div');
    this.hicElement = this.element;
    this.lastNativeFocus = null; // my control that had focus most recently
    this.resizeObserver = null;
    this.setUpElement();
    this.parkElement();
    this.fixLayout();
};

HTMLMorph.prototype.setUpElement = function () {
    var element = this.element;
    element.setAttribute('drawable', '');
    element.classList.add('morphic-html');
    element.hicMorph = this;
    element.addEventListener('focusin', event => this.nativeFocusIn(event));
    element.addEventListener('focusout', event => this.nativeFocusOut(event));
    if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.elementResized());
        this.resizeObserver.observe(element);
    }
};

// HTMLMorph layout:

HTMLMorph.prototype.parkElement = function () {
    // the browser can only lay my element out - and I can only measure it -
    // inside the canvas. Until I'm part of the world and it gets its
    // proper place in the tree (createAccessibleElement) it waits here.
    var host = this.hostWorld;
    if (!this.element.isConnected && host && host.hicParking) {
        host.hicParking.appendChild(this.element);
        host.hicMorphs.add(this); // lets the sweep collect me if I never show
        host.hicDirty = true;
    }
};

HTMLMorph.prototype.fixLayout = function () {
    // my extent is whatever the browser laid my element out as
    var element = this.element;
    if (element.isConnected) {
        this.bounds.setExtent(new Point(
            Math.max(element.offsetWidth, 1),
            Math.max(element.offsetHeight, 1)
        ));
    }
};

HTMLMorph.prototype.elementResized = function () {
    var before = this.extent();
    this.fixLayout();
    if (this.extent().eq(before)) {return; }
    if (this.parent) {
        this.parent.fullChanged();
        if (this.parent.fixLayout) {
            this.parent.fixLayout();
        }
        this.parent.fullChanged();
    }
};

// HTMLMorph rendering:

HTMLMorph.prototype.render = function (ctx) {
    var world = ctx.canvas.hicWorld,
        element = this.element;
    if (world && world.htmlInCanvas && element.isConnected) {
        try {
            // an explicit size, in my own coordinates: the default size is
            // in canvas pixels, which Morphic's retina / ZOOM scaling of
            // the context would then scale a second time
            ctx.drawElementImage(element, 0, 0, this.width(), this.height());
            element.hicHasGeometry = true;
            world.hicDirty = true;
            return;
        } catch (err) {
            nop(); // no snapshot yet - the paint event will bring me back
        }
    }
    this.renderPlaceholder(ctx);
};

HTMLMorph.prototype.renderPlaceholder = function (ctx) {
    // an element can only be drawn into the canvas it lives in, so anywhere
    // else (fullImage(), drag shadows, exported pictures) I'm a faint box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(0, 0, this.width(), this.height());
};

// HTMLMorph accessibility - my element IS my node:

HTMLMorph.prototype.createAccessibleElement = function () {
    var world = this.a11yWorld(),
        element = this.element;
    if (this.a11yElement || !world || !world.htmlInCanvas || !world.a11yRoot) {
        return;
    }
    element.morph = this; // the accessibility layer's back-pointer
    this.a11yElement = element;
    this._a11yDomParentMorph = this.a11yParentMorph();
    (this.a11yParentElement() || world.a11yRoot).appendChild(element);
    world.hicMorphs.add(this);
    world.hicForms.add(this);
    this.syncAccessibleGeometry();
    this.fixLayout();
    return element;
};

HTMLMorph.prototype.updateAccessibleElement = function () {
    // my element names itself; only an explicit label overrides it
    if (this.a11yElement && this._ariaLabel) {
        this.a11yElement.setAttribute('aria-label', this._ariaLabel);
    }
};

HTMLMorph.prototype.syncAccessibleGeometry = function () {
    // drawing me positions my element, so all that's left to sync is
    // whether I'm showing at all
    var element = this.a11yElement,
        world,
        showing;
    if (!element) {return; }
    showing = this.hicIsShowing();
    if (showing === !element.inert) {return; }
    element.inert = !showing; // out of the AT tree, tab order + hit testing
    if (!showing) {
        world = this.a11yWorld();
        if (world && world.htmlInCanvas && element.hicHasGeometry) {
            world.worldCanvas.clearElementGeometry(element);
            element.hicHasGeometry = false;
        }
    }
};

HTMLMorph.prototype.destroyAccessibleElement = function () {
    var world = this.a11yWorld();
    HTMLMorph.uber.destroyAccessibleElement.call(this);
    if (world && world.hicMorphs) {
        world.hicMorphs.delete(this);
        world.hicForms.delete(this);
    }
};

HTMLMorph.prototype.releaseHTMLElement = function () {
    // I'm not in the world (any more): take my element out of the canvas,
    // but keep it - I get it back when I'm added to a world (again)
    this.element.remove();
    return true;
};

HTMLMorph.prototype.destroy = function () {
    if (this.resizeObserver) {
        this.resizeObserver.disconnect();
    }
    HTMLMorph.uber.destroy.call(this);
    this.element.remove();
};

// HTMLMorph focus + keyboard - native controls drive themselves:

HTMLMorph.prototype.nativeStops = function () {
    // my focusable controls, in DOM (= Tab) order
    return Array.from(this.element.querySelectorAll(
        'input, select, textarea, button, a[href], [tabindex]'
    )).filter(each => !each.disabled && each.tabIndex >= 0 &&
        each.type !== 'hidden');
};

HTMLMorph.prototype.isFocusable = function () {
    return HTMLMorph.uber.isFocusable.call(this) &&
        this.nativeStops().length > 0;
};

HTMLMorph.prototype.a11yActiveTarget = function () {
    // no Morphic focus ring: the element paints its own :focus-visible
    return null;
};

HTMLMorph.prototype.focusEdge = function (backwards) {
    var stops = this.nativeStops(),
        target = backwards ? stops[stops.length - 1] : stops[0];
    if (target) {
        target.focus({preventScroll: true});
    }
};

HTMLMorph.prototype.reactToFocus = function () {
    // Morphic's focus manager moved focus onto me (Tab from a morph, a
    // dialog opening, ...): hand it on to my first - or, travelling
    // backwards, my last - control. The container itself is no Tab stop.
    var element = this.element,
        world = this.a11yWorld(),
        active = document.activeElement;
    element.removeAttribute('tabindex');
    if (active !== element && element.contains(active)) {return; }
    if (world && !world.hicTabDirection && this.lastNativeFocus &&
            element.contains(this.lastNativeFocus)) {
        // not tabbing in, but returning (e.g. a menu closed): back to
        // where the user was
        this.lastNativeFocus.focus({preventScroll: true});
    } else {
        this.focusEdge(world && world.hicTabDirection < 0);
    }
};

HTMLMorph.prototype.nativeFocusIn = function (event) {
    // DOM focus arrived on one of my controls (a click, a screen reader)
    var world = this.a11yWorld();
    if (!world || event.target === this.element) {return; }
    this.lastNativeFocus = event.target;
    if (world.focusedMorph !== this) {
        world.setFocusFromDOM(this);
    }
    this.element.removeAttribute('tabindex');
};

HTMLMorph.prototype.nativeFocusOut = function (event) {
    var world = this.a11yWorld(),
        next = event.relatedTarget;
    if (!world || (next && this.element.contains(next))) {return; }
    if (!world._a11ySyncingFocus) {
        world.handleA11yBlur(this, next);
    }
};

HTMLMorph.prototype.a11yNativeKey = function (event) {
    // called by the accessibility layer's key handler while focus is in
    // me. Answer true to leave the key to the browser - typing, Space on a
    // checkbox, Tab between my own controls - and false for the keys
    // Morphic's focus manager must see: Tab off either end of my controls
    // (on to the next morph) and Escape (the dialog's cancel).
    var stops, index;
    if (!this.element.contains(document.activeElement)) {return false; }
    if (event.key === 'Escape') {return false; }
    if (event.key === 'Tab') {
        stops = this.nativeStops();
        index = stops.indexOf(document.activeElement);
        if (event.shiftKey ? index <= 0 : index === stops.length - 1) {
            return false;
        }
    }
    return true;
};

// StringMorph native text ////////////////////////////////////////////////

/*
    A StringMorph that opts in (isNativeText) paints through a DOM text
    element instead of fillText() - whenever it is drawn onto the world
    canvas of a world with the 'text' feature on. Morphic keeps measuring
    with measureText() and keeps doing the layout, so nothing about block
    geometry changes; the element is sized to my bounds and styled to match
    (font, color, the embossing shadow).

    Everything else still uses the classic path: offscreen rendering (drag
    images, script pictures, fullImage()), passwords, text being edited or
    selected, "showing blanks" - and the very first frame of new or changed
    text, because an element can only be drawn once the browser has taken a
    snapshot of it (the paint event then repaints it natively, before that
    frame is shown).
*/

StringMorph.prototype.isNativeText = false;

StringMorph.prototype.hicTextRoles = [
    // accessible ancestors that may hold my text node as their content
    'button', 'option', 'textbox', 'region', 'menuitem', 'tab', 'treeitem'
];

StringMorph.prototype.renderClassic = StringMorph.prototype.render;

StringMorph.prototype.render = function (ctx) {
    var world = ctx.canvas.hicWorld,
        element;
    if (world && world.htmlInCanvas && world.htmlInCanvas.text &&
            this.wantsNativeText(world)) {
        element = this.nativeTextElement(world);
        if (element.hicReady) {
            try {
                ctx.drawElementImage(
                    element,
                    0,
                    0,
                    this.width(),
                    this.height()
                );
                element.hicHasGeometry = true;
                world.hicDirty = true;
                return;
            } catch (err) {
                element.hicReady = false;
            }
        }
    }
    this.renderClassic(ctx);
};

StringMorph.prototype.wantsNativeText = function (world) {
    if (this.isPassword || this.startMark !== this.endMark ||
            (this.isShowingBlanks && this.text.indexOf(' ') > -1) ||
            (world.cursor && world.cursor.target === this)) {
        return false;
    }
    return this.isNativeText || world.htmlInCanvas.text === 'all';
};

StringMorph.prototype.nativeTextElement = function (world) {
    // answer my text element, creating / restyling / re-homing it as needed
    var element = this.hicElement,
        offset = this.shadowOffset || new Point(0, 0),
        shadow = this.getShadowRenderColor(),
        font = this.font(),
        color = this.getRenderColor().toString(),
        signature,
        baseline,
        parent;

    if (!element || element.hicMorph !== this) {
        element = document.createElement('span');
        element.setAttribute('drawable', '');
        element.className = 'morphic-text';
        element.hicMorph = this;
        this.hicElement = element;
        world.hicMorphs.add(this);
    }
    shadow = shadow ? shadow.toString() : '';
    signature = font + '|' + color + '|' + shadow + '|' + offset.x + '|' +
        offset.y + '|' + this.width() + '|' + this.height() + '|' + this.text;
    if (signature !== element.hicSignature) {
        element.hicSignature = signature;
        element.hicReady = false; // wait for the browser's next snapshot
        element.textContent = this.text;
        element.style.font = font;
        baseline = this.nativeBaseline(
            font,
            this.height() - Math.abs(offset.y)
        );
        element.style.lineHeight = baseline[0] + 'px';
        element.style.color = color;
        element.style.width = this.width() + 'px';
        element.style.height = this.height() + 'px';
        // the classic renderer puts the text at the far side of the shadow
        element.style.paddingLeft = Math.abs(Math.min(offset.x, 0)) + 'px';
        element.style.paddingTop =
            (Math.abs(Math.min(offset.y, 0)) + baseline[1]) + 'px';
        element.style.textShadow = shadow ?
            offset.x + 'px ' + offset.y + 'px 0 ' + shadow : 'none';
    }
    parent = this.nativeTextParent(world);
    if (element.parentNode !== parent) {
        element.hicReady = false;
        parent.appendChild(element);
    }
    return element;
};

StringMorph.prototype.hicBaselines = new Map(); // font + height -> fix

StringMorph.prototype.nativeBaseline = function (font, height) {
    // answer what it takes to put my element's text on exactly the
    // baseline the classic renderer uses: [line-height, extra top padding].
    // fillText() hangs the text from the "bottom" baseline at the given
    // height, CSS centers the font's ascent + descent in the line box (and
    // snaps to whole pixels) - the two disagree by an amount that depends
    // on the font and on the display's pixel ratio. Measured once per font
    // and size, then cached.
    var key = font + '|' + height + '|' + window.devicePixelRatio,
        answer = this.hicBaselines.get(key),
        ctx = this.measureCtx,
        probe,
        mark,
        bottom,
        wanted,
        actual,
        delta,
        lines;
    if (answer) {return answer; }

    // where fillText() puts the alphabetic baseline
    ctx.font = font;
    ctx.textBaseline = 'bottom';
    bottom = ctx.measureText('x').fontBoundingBoxAscent;
    ctx.textBaseline = 'alphabetic';
    wanted = height - (bottom - ctx.measureText('x').fontBoundingBoxAscent);

    // where CSS puts it, in a line box of that height
    probe = document.createElement('div');
    probe.style.cssText = 'position: absolute; visibility: hidden; ' +
        'white-space: pre; margin: 0; padding: 0; border: 0;';
    probe.style.font = font;
    probe.style.lineHeight = height + 'px';
    probe.textContent = 'x';
    mark = document.createElement('span');
    mark.style.cssText = 'display: inline-block; width: 0; height: 0; ' +
        'vertical-align: baseline;';
    probe.appendChild(mark);
    document.body.appendChild(probe);
    actual = mark.getBoundingClientRect().bottom -
        probe.getBoundingClientRect().top;
    probe.remove();

    // move down with padding; move up by shrinking the line box (taking
    // 2 off its height lifts the baseline by 1) and pad back the rest
    delta = wanted - actual;
    if (!isFinite(delta)) {
        delta = 0;
    }
    lines = delta < 0 ? Math.ceil(-delta) : 0;
    answer = [height - 2 * lines, delta + lines];
    this.hicBaselines.set(key, answer);
    return answer;
};

StringMorph.prototype.nativeTextParent = function (world) {
    // my text belongs inside the node of the thing it is written on - a
    // block, a slot, a button - if that has one; else in the text host
    var m = this.parent;
    while (m) {
        if (m.a11yElement && m.a11yElement.morph === m) {
            return this.hicTextRoles.includes(m.ariaRole) ?
                m.a11yElement : world.hicTextHost;
        }
        m = m.parent;
    }
    return world.hicTextHost;
};

// the words on blocks, and the contents of their input slots (both load
// before this file in Snap!; plain Morphic doesn't have them)

if (typeof BlockLabelMorph !== 'undefined') {
    BlockLabelMorph.prototype.isNativeText = true;
}

if (typeof InputSlotStringMorph !== 'undefined') {
    InputSlotStringMorph.prototype.isNativeText = true;
}

// DialogBoxMorph HTML credentials prompt /////////////////////////////////

/*
    The cloud "Sign in" / "Sign up" / "Change password" / "Reset password"
    dialogs, with their bodies as real HTML forms: <label>s bound to
    <input>s, type=password, autocomplete hints (password managers), native
    <select>s, links, inline errors announced through role=alert. The
    dialog frame, title and OK / Cancel buttons stay ordinary morphs.

    Same arguments, same result object, same validation rules as
    DialogBoxMorph.prototype.promptCredentials (widgets.js), which is used
    as is wherever HTML-in-Canvas isn't enabled.
*/

if (typeof DialogBoxMorph !== 'undefined') {

DialogBoxMorph.prototype.hicCredentialsCount = 0;

DialogBoxMorph.prototype.promptCredentialsClassic =
    DialogBoxMorph.prototype.promptCredentials;

DialogBoxMorph.prototype.promptCredentials = function (
    title,
    purpose,
    tosURL,
    tosLabel,
    prvURL,
    prvLabel,
    checkBoxLabel,
    world,
    pic,
    msg
) {
    if (world && world.htmlInCanvas && world.htmlInCanvas.forms) {
        return this.promptCredentialsHTML.apply(this, arguments);
    }
    return this.promptCredentialsClassic.apply(this, arguments);
};

DialogBoxMorph.prototype.promptCredentialsHTML = function (
    title,
    purpose,
    tosURL,
    tosLabel,
    prvURL,
    prvLabel,
    checkBoxLabel,
    world,
    pic,
    msg
) {
    var myself = this,
        form = document.createElement('form'),
        prefix,
        fields = {},
        months = [
            'January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'
        ],
        thisYear = new Date().getFullYear(),
        firstYear = thisYear - 20,
        emailLabel,
        error,
        row,
        column,
        year,
        body;

    DialogBoxMorph.prototype.hicCredentialsCount += 1;
    prefix = 'snap-credentials-' + this.hicCredentialsCount + '-';

    function oneLine(string) {
        return localize(string).replace(/\s*[\n\r]+\s*/g, ' ');
    }

    function add(tag, text, parent) {
        var element = document.createElement(tag);
        if (text) {
            element.textContent = text;
        }
        (parent || form).appendChild(element);
        return element;
    }

    function field(name, labelString, type, autocomplete, parent) {
        var label = add('label', oneLine(labelString), parent),
            input = add(type === 'select' ? 'select' : 'input', null, parent);
        input.id = prefix + name;
        input.name = name;
        label.htmlFor = input.id;
        if (type !== 'select') {
            input.type = type;
            input.autocomplete = autocomplete;
            input.spellcheck = false;
            input.autocapitalize = 'none';
        }
        input.required = true;
        fields[name] = input;
        return label;
    }

    function option(select, text, value) {
        var element = add('option', text, select);
        element.value = value;
        return element;
    }

    function value(name) {
        return fields[name] ? fields[name].value : '';
    }

    function age() {
        var today = thisYear + new Date().getMonth() / 12,
            birthYear = +value('year') || 0,
            month = Math.max(months.indexOf(value('month')), 0);
        return today - (birthYear + month / 12);
    }

    function updateEmailLabel() {
        if (emailLabel) {
            emailLabel.textContent = localize(
                age() <= 13 ? 'E-mail address of parent or guardian:'
                    : 'E-mail address:'
            );
        }
    }

    form.noValidate = true; // we report errors ourselves, in the form
    form.setAttribute('aria-label', oneLine(title));

    if (msg) {
        add('p', localize(msg));
    }

    if (purpose === 'login' || purpose === 'signup' ||
            purpose === 'resetPassword' || purpose === 'resendVerification') {
        field('username', 'User name:', 'text', 'username');
    }

    if (purpose === 'signup') {
        row = add('div');
        row.className = 'row';
        column = add('div', null, row);
        field('month', 'Birth date:', 'select', null, column);
        option(fields.month, '', '');
        months.forEach(each => option(fields.month, localize(each), each));
        column = add('div', null, row);
        field('year', 'year:', 'select', null, column);
        option(fields.year, '', '');
        for (year = thisYear; year > firstYear; year -= 1) {
            option(fields.year, year, year);
        }
        option(
            fields.year,
            firstYear + ' ' + localize('or before'),
            firstYear
        );
        fields.month.addEventListener('change', updateEmailLabel);
        fields.year.addEventListener('change', updateEmailLabel);
        emailLabel = field('email', 'E-mail address:', 'email', 'email');
        updateEmailLabel();
        field('password', 'Password:', 'password', 'new-password');
        field(
            'passwordRepeat',
            'Repeat Password:',
            'password',
            'new-password'
        );
    }

    if (purpose === 'login') {
        field('password', 'Password:', 'password', 'current-password');
    }

    if (purpose === 'changePassword') {
        field(
            'oldpassword',
            'Old password:',
            'password',
            'current-password'
        );
        field('password', 'New password:', 'password', 'new-password');
        field(
            'passwordRepeat',
            'Repeat new password:',
            'password',
            'new-password'
        );
    }

    if (tosURL || prvURL) {
        row = add('div');
        row.className = 'links';
        [[tosURL, tosLabel], [prvURL, prvLabel]].forEach(each => {
            var link;
            if (!each[0]) {return; }
            link = add('a', oneLine(each[1]), row);
            link.href = each[0];
            link.target = '_blank';
            link.rel = 'noopener';
        });
    }

    if (checkBoxLabel) {
        row = add('label');
        row.className = 'check';
        fields.choice = add('input', null, row);
        fields.choice.type = 'checkbox';
        fields.choice.name = 'choice';
        add('span', oneLine(checkBoxLabel), row);
    }

    error = add('p');
    error.className = 'error';
    error.id = prefix + 'error';
    error.setAttribute('role', 'alert');

    function indicate(input, string) {
        // show + announce the problem, mark the field, put focus on it
        Object.keys(fields).forEach(name => {
            fields[name].removeAttribute('aria-invalid');
            fields[name].removeAttribute('aria-describedby');
        });
        error.textContent = oneLine(string);
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
        input.focus({preventScroll: true});
        return false;
    }

    function validInputs() {
        var checklist = {
                login: ['username', 'password'],
                signup: ['username', 'month', 'year', 'email', 'password',
                    'passwordRepeat'],
                changePassword: ['oldpassword', 'password', 'passwordRepeat'],
                resetPassword: ['username'],
                resendVerification: ['username']
            }[purpose] || [],
            empty = checklist.find(name => !value(name)),
            email = value('email');

        if (empty) {
            return indicate(fields[empty], 'please fill out\nthis field');
        }
        if (purpose === 'signup') {
            if (value('username').length < 4) {
                return indicate(
                    fields.username,
                    'User name must be four\ncharacters or longer'
                );
            }
            if (email.indexOf(' ') > -1 || email.indexOf('@') === -1 ||
                    email.indexOf('.') === -1 || email.length < 5) {
                return indicate(
                    fields.email,
                    'please provide a valid\nemail address'
                );
            }
        }
        if (purpose === 'changePassword' || purpose === 'signup') {
            if (value('password').length < 6) {
                return indicate(
                    fields.password,
                    'password must be six\ncharacters or longer'
                );
            }
            if (value('password') !== value('passwordRepeat')) {
                return indicate(
                    fields.passwordRepeat,
                    'passwords do\nnot match'
                );
            }
        }
        if (purpose === 'signup' && !fields.choice.checked) {
            return indicate(fields.choice, 'please agree to\nthe TOS');
        }
        error.textContent = '';
        return true;
    }

    // editing clears a reported problem
    form.addEventListener('input', () => {
        if (!error.textContent) {return; }
        error.textContent = '';
        Object.keys(fields).forEach(name => {
            fields[name].removeAttribute('aria-invalid');
            fields[name].removeAttribute('aria-describedby');
        });
    });

    // Enter in a text field accepts the dialog, like in the classic one
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT' &&
                event.target.type !== 'checkbox' && !event.isComposing) {
            event.preventDefault();
            myself.accept();
        }
    });

    body = new HTMLMorph(form);

    this.labelString = title;
    this.createLabel();
    if (pic) {this.setPicture(pic); }

    this.addBody(body);

    this.addButton('ok', 'OK');
    this.addButton('cancel', 'Cancel');
    this.fixLayout();

    this.accept = function () {
        if (validInputs()) {
            DialogBoxMorph.prototype.accept.call(myself);
        }
    };

    this.edit = function () {
        // put the caret into the first field
        var world = myself.world();
        if (world && world.focusedMorph !== body) {
            world.setFocus(body, {force: true});
        } else {
            body.focusEdge();
        }
    };

    this.getInput = function () {
        return {
            username: value('username'),
            email: value('email'),
            oldpassword: value('oldpassword'),
            password: value('password'),
            passwordRepeat: value('passwordRepeat'),
            choice: fields.choice ? fields.choice.checked : false
        };
    };

    if (!this.key) {
        this.key = 'credentials' + title + purpose;
    }

    this.popUp(world);
};

}
