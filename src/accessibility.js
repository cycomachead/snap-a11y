/*

    accessibility.js

    screen-reader / assistive-technology (AT) support for morphic.js

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
    Morphic renders to a single <canvas>, which is opaque to screen readers.
    This module builds a *parallel, invisible DOM tree* that mirrors the morphs
    we choose to expose, kept in two-way sync with Morphic state, so that the
    browser's native focus / tab / assistive-technology machinery can be reused
    rather than reinvented.

    Design (Phase 1 - the Morphic core):

    * a SINGLE global AT focus: world.focusedMorph (distinct from the existing
      world.keyboardFocus, which is the raw-key receiver for text editing/menus)
    * each opted-in Morph (isAccessible === true) gets one real, focusable DOM
      node inside an overlay container, with a role + accessible name + an
      extensible bag of aria-* attributes
    * native "roving tabindex" focus is the primary model; widgets that the ARIA
      Authoring Practices Guide expects to drive with aria-activedescendant
      (e.g. a combobox/search) opt in via a11yFocusMode and an a11yHandleKey hook
    * a focus-visible blue ring (FocusIndicatorMorph) is shown only when focus
      most recently arrived from the keyboard
    * geometry + focus stay in two-way sync regardless of who intercepts the
      keypress / pointer event

    * a focus-trapping morph (a11yTrapsFocus, e.g. a dialog) keeps Tab
      cycling among its own stops while focus is inside it, and Escape is its
      cancel action; ListMorph is an ARIA listbox with arrow-key navigation

    This file is purely *additive*: it extends Morph.prototype and
    WorldMorph.prototype (plus MenuMorph / MenuItemMorph / ListMorph /
    StringMorph) and defines FocusIndicatorMorph. The handful of changes to
    existing morphic.js functions (global focus state, the changed()/
    addChild()/removeChild()/destroy()/hide()/show()/edit()/stopEditing()/
    ListMorph.select() hooks) live in morphic.js itself, each guarded so
    morphic.js still runs without this file. Widget-level dialogs
    (DialogBoxMorph, InputFieldMorph) carry their own hooks in widgets.js.

*/

/*global Morph, WorldMorph, Node, Color, Point, Rectangle, ZOOM, nop, detect,
  MenuMorph, MenuItemMorph, ListMorph, ScrollFrameMorph, ScriptFocusMorph,
  StringMorph, StringFieldMorph,
  getDocumentPositionOf, MorphicPreferences, modules, document, window*/

/*jshint esversion: 11*/

// Global settings ////////////////////////////////////////////////////////

if (typeof modules !== 'undefined') {
    modules.accessibility = '2026-08-15';
}

// monotonic id source for elements that need a stable DOM id (e.g. menu items
// referenced by aria-activedescendant)
var a11yIdCounter = 0;

// Custom accessible names for specific block selectors, used as the block's
// "template label" in the palette (which deliberately omits arguments).
// Extend this over time; keys are block selectors. Exposed as a global so it
// can be tweaked/experimented with at runtime.
var A11yBlockTemplateLabels = {
    doFor: 'for i loop'
};

// shared visually-hidden-but-AT-visible style for every parallel element.
// NOTE: we deliberately avoid display:none / visibility:hidden (both remove
// the node from the accessibility tree) and the width:1px clip trick. opacity:0
// keeps the node in the AT tree AND focusable AND with real geometry, so screen
// reader touch-exploration and our focus ring agree on where things are.
WorldMorph.prototype.a11yHiddenStyle = {
    position: 'absolute',
    display: 'block',
    margin: '0',
    padding: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none', // the canvas handles real pointer input
    background: 'transparent',
    color: 'transparent'
};

// Morph accessibility API ////////////////////////////////////////////////

// opt-in defaults - keep the overwhelming majority of morphs out of the tree
Morph.prototype.isAccessible = false; // opt-in: only true morphs get a DOM node
Morph.prototype.a11yIgnore = false;   // never expose or traverse (e.g. the ring)
Morph.prototype.a11yElement = null;   // the parallel DOM node (lazily created)
Morph.prototype.ariaRole = null;      // 'button' | 'region' | 'menuitem' | ...
Morph.prototype.ariaTag = 'div';      // DOM tag; 'button' activates natively
Morph.prototype.a11yFocusMode = 'roving';      // | 'activedescendant'
Morph.prototype.a11yDisabled = false;          // aria-disabled + skip in tab ring
Morph.prototype.excludeFromTabRing = false;    // present, but not a Tab stop
Morph.prototype.ariaAttributes = null;         // lazy {}: extensible attr bag
Morph.prototype._ariaLabel = null;             // explicit accessible name
Morph.prototype.a11yId = null;                 // optional stable element id
Morph.prototype.a11yHandleKey = null;          // composite widgets set a function
Morph.prototype._a11yDomParentMorph = null;    // accessible ancestor I nest under
Morph.prototype.a11yTrapsFocus = false;        // Tab cycles inside me (dialogs)

Morph.prototype.isFocusable = function () {
    return this.isAccessible && this.isVisible && !this.a11yDisabled &&
        !this.a11yIgnore;
};

Morph.prototype.ariaLabel = function () {
    // can be overridden by heirs (e.g. a button returns its label string)
    return this._ariaLabel;
};

Morph.prototype.setAriaLabel = function (string) {
    this._ariaLabel = string;
    this.updateAccessibleElement();
};

Morph.prototype.setAria = function (key, value) {
    // set / clear one aria-* (or plain) attribute, live-syncing the DOM node
    if (!this.ariaAttributes) {
        this.ariaAttributes = {};
    }
    if (value === null || value === undefined) {
        delete this.ariaAttributes[key];
        if (this.a11yElement) {
            this.a11yElement.removeAttribute(key);
        }
    } else {
        value = '' + value;
        this.ariaAttributes[key] = value;
        if (this.a11yElement) {
            this.a11yElement.setAttribute(key, value);
        }
    }
};

Morph.prototype.setAccessible = function (bool, role) {
    // convenience opt-in toggle
    this.isAccessible = bool;
    if (role) {
        this.ariaRole = role;
    }
    if (bool) {
        this.createAccessibleElement();
    } else {
        this.destroyAccessibleElement();
    }
};

Morph.prototype.ensureA11yId = function () {
    // give myself a stable DOM id, e.g. so a menu can point its
    // aria-activedescendant at me
    if (!this.a11yId) {
        a11yIdCounter += 1;
        this.a11yId = 'morphic-a11y-' + a11yIdCounter;
        if (this.a11yElement) {
            this.a11yElement.id = this.a11yId;
        }
    }
    return this.a11yId;
};

Morph.prototype.a11yActiveTarget = function () {
    // the morph the focus ring should hug when I'm focused; composites like
    // MenuMorph override this to point at their currently active item
    return this;
};

Morph.prototype.a11yBounds = function () {
    // the rectangle my parallel DOM node should occupy. Defaults to my bounds;
    // override (per instance) to make a landmark span more than one morph, e.g.
    // a full-width control bar that also covers the logo / app menu
    return this.bounds;
};

Morph.prototype.a11yWorld = function () {
    // robustly answer my world. MenuMorph (and a few other morphs) shadow the
    // world() METHOD with a `world` PROPERTY (a WorldMorph or null), so we
    // can't just call this.world() everywhere.
    if (this.world instanceof Function) {
        return this.world();
    }
    if (this.world instanceof WorldMorph) {
        return this.world;
    }
    var root = this.root && this.root();
    return (root instanceof WorldMorph) ? root : null;
};

// Morph accessible-element lifecycle /////////////////////////////////////

Morph.prototype.a11yParentMorph = function () {
    // nearest ancestor morph that has a parallel DOM node, or null (=> the
    // overlay root). The a11y tree nests to mirror the morph hierarchy, which
    // is what landmark grouping / lists / menus need.
    var p = this.parent;
    while (p) {
        if (p.a11yElement) {
            return p;
        }
        p = p.parent;
    }
    return null;
};

Morph.prototype.a11yParentElement = function () {
    var par = this.a11yParentMorph(),
        world;
    if (par) {
        return par.a11yElement;
    }
    world = this.a11yWorld();
    return world ? world.a11yRoot : null;
};

Morph.prototype.a11yIsTagged = function () {
    // true if I have my OWN parallel element (not one inherited by fullCopy from
    // another morph - e.g. a block dragged out of the palette)
    return !!(this.a11yElement && this.a11yElement.morph === this);
};

Morph.prototype.createAccessibleElement = function () {
    var world = this.a11yWorld(),
        el,
        myself = this;

    // drop a11y state inherited from a copied morph (fullCopy duplicates the
    // a11yElement / a11yId references), so we build a fresh, unique node
    if (this.a11yElement && this.a11yElement.morph !== this) {
        this.a11yElement = null;
        this.a11yId = null;
        this._a11yDomParentMorph = null;
    }
    if (this.a11yElement || this.a11yIgnore || !this.isAccessible) {
        return;
    }
    if (!world || !world.accessibilityEnabled || !world.a11yRoot) {
        return; // not attached to an accessibility-enabled world (yet)
    }

    el = document.createElement(this.ariaTag || 'div');
    el.morph = this; // back-pointer used by the focus event handlers
    if (this.ariaTag === 'button') {
        el.setAttribute('type', 'button'); // avoid implicit form submit
    }
    if (this.ariaRole) {
        el.setAttribute('role', this.ariaRole);
    }
    if (this.a11yId) {
        el.id = this.a11yId;
    }
    if (this.a11yDisabled) {
        el.setAttribute('aria-disabled', 'true');
    }
    if (this.ariaAttributes) {
        Object.keys(this.ariaAttributes).forEach(key =>
            el.setAttribute(key, this.ariaAttributes[key]));
    }
    el.tabIndex = -1; // roving tabindex: focusable only programmatically
    Object.assign(el.style, world.a11yHiddenStyle);

    // two-way focus sync (guarded against our own programmatic .focus()).
    // focusin / focusout bubble up through nested elements (a button inside
    // a region), so each element only reacts to its own focus changes
    el.addEventListener('focusin', function (event) {
        if (world._a11ySyncingFocus || event.target !== el) {return; }
        world.setFocusFromDOM(myself);
    });
    el.addEventListener('focusout', function (event) {
        if (world._a11ySyncingFocus || event.target !== el) {return; }
        world.handleA11yBlur(myself, event.relatedTarget);
    });
    // native activation: Enter/Space on a <button>, an AT "click", a real
    // mouse click never reaches here (pointer-events:none -> canvas gets it)
    el.addEventListener('click', function (event) {
        // only my own activation - clicks bubble up through nested elements
        // (a button inside a dialog) and must not activate the ancestors
        if (event.target !== el) {return; }
        world.activateAccessible(myself, event);
    });

    this.a11yElement = el;
    this._a11yDomParentMorph = this.a11yParentMorph();
    (this.a11yParentElement() || world.a11yRoot).appendChild(el);
    this.syncAccessibleGeometry();
    this.updateAccessibleElement();
    return el;
};

Morph.prototype.updateAccessibleElement = function () {
    // refresh live ARIA state; fast no-op when there's no element.
    // heirs may override to also refresh aria-checked / aria-pressed / value.
    var el = this.a11yElement,
        label;
    if (!el) {return; }
    label = this.ariaLabel();
    if (label) {
        el.setAttribute('aria-label', label);
    } else {
        el.removeAttribute('aria-label');
    }
};

Morph.prototype.syncAccessibleGeometry = function () {
    // position the parallel node over the morph. Positions are relative to the
    // a11y root (which already sits at the canvas' document position), so we
    // only need local bounds * ZOOM (ZOOM is 1 in the normal, un-zoomed case).
    var el = this.a11yElement,
        box,
        origin,
        zoom,
        par,
        ox = 0,
        oy = 0,
        visible;
    if (!el) {return; }
    box = this.a11yBounds();
    origin = box.origin;
    zoom = (typeof ZOOM === 'number') ? ZOOM : 1;
    // position relative to my accessible DOM parent: the overlay nests to
    // mirror the morph hierarchy, so each node's offset is relative to the
    // nearest accessible ancestor (or the root => world origin)
    par = this._a11yDomParentMorph;
    if (par) {
        ox = par.a11yBounds().origin.x;
        oy = par.a11yBounds().origin.y;
    }
    el.style.left = ((origin.x - ox) * zoom) + 'px';
    el.style.top = ((origin.y - oy) * zoom) + 'px';
    el.style.width = (box.width() * zoom) + 'px';
    el.style.height = (box.height() * zoom) + 'px';

    // hide from AT when hidden (or inside a hidden morph), or when fully
    // clipped out of view by a scroll frame
    visible = this.a11yIsShowing() ? this.visibleBounds() : null;
    if (!visible || visible.width() <= 0 || visible.height() <= 0) {
        el.setAttribute('aria-hidden', 'true');
    } else if (el.getAttribute('aria-hidden') === 'true') {
        el.removeAttribute('aria-hidden');
    }
};

Morph.prototype.a11yIsShowing = function () {
    // am I visible, and are all my ancestors? (isVisible is per-morph, a
    // hidden parent doesn't flip its children's flag)
    var m = this;
    while (m) {
        if (m.isVisible === false) {
            return false;
        }
        m = m.parent;
    }
    return true;
};

Morph.prototype.a11ySyncVisibility = function () {
    // called from hide() / show(): re-sync aria-hidden across my subtree
    this.forAllChildren(m => {
        if (m.a11yElement) {
            m.syncAccessibleGeometry();
        }
    });
};

Morph.prototype.destroyAccessibleElement = function () {
    var el = this.a11yElement,
        world,
        hadFocus = el && el.contains(document.activeElement); // me or a child
    if (!el) {return; }
    world = this.a11yWorld();
    if (world && world.focusedMorph === this) {
        world.focusedMorph = null;
        world.updateFocusRing(false);
    }
    if (el.parentNode) {
        el.parentNode.removeChild(el);
    }
    el.morph = null;
    this.a11yElement = null;
    // don't let native focus fall off to <body> (where keystrokes reach
    // nobody): give it back to the hidden textarea, Morphic's key receiver
    if (hadFocus && world && world.keyboardHandler) {
        world._a11ySyncingFocus = true;
        try {
            world.keyboardHandler.focus();
        } catch (err) {
            nop();
        }
        world._a11ySyncingFocus = false;
    }
};

// subtree helpers used by the addChild / removeChild / destroy hooks

Morph.prototype.createAccessibleElementTree = function () {
    if (this.a11yIgnore) {return; }
    if (this.isAccessible) {
        this.createAccessibleElement();
    }
    (this.children || []).forEach(child => {
        if (child && child.createAccessibleElementTree) {
            child.createAccessibleElementTree();
        }
    });
};

Morph.prototype.destroyAccessibleElementTree = function () {
    this.destroyAccessibleElement();
    (this.children || []).forEach(child => {
        if (child && child.destroyAccessibleElementTree) {
            child.destroyAccessibleElementTree();
        }
    });
};

// reading / navigation order key (unused by the v1 pre-order traversal,
// provided so a later phase can reorder a region without restructuring)
Morph.prototype.a11yOrderKey = function () {
    return this.bounds.top() * 100000 + this.bounds.left();
};

// optional hooks heirs can implement:
//   reactToFocus(viaKeyboard)  - morph gained AT focus
//   reactToUnfocus()           - morph lost AT focus
//   a11yActivate(event)        - custom activation (else mouseClickLeft)
//   a11yTabStops()             - a focus-trapping morph's preferred Tab order
//                                (an Array of morphs; unlisted stops follow in
//                                screen order)
//   a11yEscape()               - a focus-trapping morph's Escape action

// WorldMorph accessibility ///////////////////////////////////////////////

WorldMorph.prototype.accessibilityEnabled = true; // master switch (per world)
WorldMorph.prototype.focusRingPadding = 2;
WorldMorph.prototype.focusRingColor = 'rgb(0, 120, 255)';

WorldMorph.prototype.initAccessibility = function () {
    var root,
        canvas = this.worldCanvas;

    if (!this.accessibilityEnabled || this.a11yRoot) {
        return;
    }

    // the parallel DOM root, overlaying the canvas
    root = document.createElement('div');
    root.setAttribute('id', 'morphic_a11y_root_' + this.stamp);
    // role="application" tells the screen reader to pass keystrokes through to
    // our own navigation rather than using its browse-mode arrow keys
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', this.a11yLabel || 'Morphic world');
    Object.assign(root.style, {
        position: 'absolute',
        margin: '0',
        padding: '0',
        border: '0',
        overflow: 'hidden',
        pointerEvents: 'none' // never steal pointer input from the canvas
    });
    document.body.appendChild(root);
    this.a11yRoot = root;

    // the canvas is purely visual: hide it from assistive tech so the screen
    // reader reads ONLY the parallel tree, never the bare "world" canvas
    canvas.setAttribute('aria-hidden', 'true');
    this.updateAccessibilityRoot();

    // the live region announcing results / status changes to the screen
    // reader (a tiny node inside the application root; announce() fills it)
    this.a11yLiveRegion = document.createElement('div');
    this.a11yLiveRegion.setAttribute('role', 'status');
    this.a11yLiveRegion.setAttribute('aria-live', 'polite');
    this.a11yLiveRegion.setAttribute('aria-atomic', 'true');
    Object.assign(this.a11yLiveRegion.style, this.a11yHiddenStyle);
    this.a11yLiveRegion.style.width = '1px';
    this.a11yLiveRegion.style.height = '1px';
    root.appendChild(this.a11yLiveRegion);

    // the keyboard focus-visible ring
    this.focusRing = new FocusIndicatorMorph();
    this.add(this.focusRing);

    // --- additive event listeners ---------------------------------------
    // keyboard: one capture-phase listener on document. Because document is an
    // ancestor of both the canvas/textarea and our overlay, this fires for
    // EVERY keydown (mirroring the browser :focus-visible heuristic) and before
    // the textarea's own capture listener, so it can own Tab navigation when we
    // are not editing text.
    this._a11yKeydownListener = event => this.handleA11yKeydown(event);
    document.addEventListener('keydown', this._a11yKeydownListener, true);

    // pointer: remember that input came from a pointer (hides the ring) and set
    // the Tab anchor to whatever was clicked
    this._a11yPointerListener = event => {
        this.setPointerInput();
        if (event && typeof event.pageX === 'number') {
            this.focusFromClick(event);
        }
    };
    canvas.addEventListener('mousedown', this._a11yPointerListener, true);
    canvas.addEventListener('touchstart', this._a11yPointerListener, true);

    // keep the overlay aligned with the canvas on resize / scroll / zoom
    this._a11yReflowListener = () => this.updateAccessibilityRoot();
    window.addEventListener('resize', this._a11yReflowListener, false);
    window.addEventListener('scroll', this._a11yReflowListener, true);

    // build elements for any accessible morphs already present
    this.createAccessibleElementTree();
};

WorldMorph.prototype.updateAccessibilityRoot = function () {
    // position + size the overlay exactly over the canvas' *drawing surface*,
    // accounting for any border / padding so it lines up with rendered morphs
    var canvas = this.worldCanvas,
        pos;
    if (!this.a11yRoot) {return; }
    pos = getDocumentPositionOf(canvas);
    this.a11yRoot.style.left = (pos.x + canvas.clientLeft) + 'px';
    this.a11yRoot.style.top = (pos.y + canvas.clientTop) + 'px';
    this.a11yRoot.style.width = canvas.clientWidth + 'px';
    this.a11yRoot.style.height = canvas.clientHeight + 'px';
};

WorldMorph.prototype.setAccessibleLabel = function (string) {
    // set the accessible name of the application entry point (the overlay root)
    this.a11yLabel = string;
    if (this.a11yRoot) {
        this.a11yRoot.setAttribute('aria-label', string);
    }
};

WorldMorph.prototype.announce = function (text, options) {
    // speak a message through the ARIA live region (reporter results, status
    // changes, errors). options: {assertive: true} interrupts current speech
    // (reserved for errors). Clearing the region first (then filling it a beat
    // later) makes screen readers re-announce even an identical text.
    var live = this.a11yLiveRegion;
    options = options || {};
    if (!live || !text || !this.accessibilityEnabled) {return; }
    live.setAttribute('aria-live', options.assertive ? 'assertive' : 'polite');
    live.setAttribute('role', options.assertive ? 'alert' : 'status');
    live.textContent = '';
    if (this._a11yAnnounceTimer) {
        window.clearTimeout(this._a11yAnnounceTimer);
    }
    this._a11yAnnounceTimer = window.setTimeout(() => {
        live.textContent = text;
        this._a11yAnnounceTimer = null;
    }, 50);
};

WorldMorph.prototype.a11yTextEditEnded = function (textMorph) {
    // a text edit just ended (called from stopEditing): refresh the parallel
    // node of the edited text, or of the nearest tagged ancestor (e.g. the
    // input field around it) so its exposed value reflects the new text,
    // and give the hidden textarea its generic name back
    var m = textMorph;
    if (this.keyboardHandler && this._a11yKeyboardLabel) {
        this.keyboardHandler.setAttribute('aria-label', this._a11yKeyboardLabel);
    }
    while (m) {
        if (m.a11yElement) {
            m.updateAccessibleElement();
            return;
        }
        m = m.parent;
    }
};

WorldMorph.prototype.a11yPrepareTextEdit = function (textMorph) {
    // a text edit is about to start (called from edit(), before the hidden
    // textarea takes native focus): if the text belongs to an exposed textbox
    // (e.g. an input field in a dialog), name the textarea after it so the
    // screen reader announces the field rather than "keyboard input"
    var m = textMorph,
        label = null;
    if (!this.keyboardHandler || !this.accessibilityEnabled) {return; }
    if (!this._a11yKeyboardLabel) {
        this._a11yKeyboardLabel =
            this.keyboardHandler.getAttribute('aria-label') || 'keyboard input';
    }
    while (m && !label) {
        if (m.a11yElement && m.ariaRole === 'textbox') {
            label = m.ariaLabel();
        }
        m = m.parent;
    }
    this.keyboardHandler.setAttribute('aria-label',
        label || this._a11yKeyboardLabel);
};

// an edited text inside a field (a StringFieldMorph, e.g. the contents of a
// dialog's input field) shows the focus ring around the exposed field rather
// than around the bare - possibly empty, hence tiny - text
StringMorph.prototype.a11yActiveTarget = function () {
    var field = this.parent;
    if (field instanceof StringFieldMorph && field.parent &&
            field.parent.a11yElement) {
        return field.parent;
    }
    return this;
};

// --- input-source tracking (focus-visible) ------------------------------

WorldMorph.prototype.setPointerInput = function () {
    this.lastInputWasKeyboard = false;
    this.updateFocusRing(false);
};

WorldMorph.prototype.focusFromClick = function (event) {
    // a click sets the Tab anchor (like clicking a link in the browser): focus
    // the nearest tab-stop ancestor of the clicked morph, WITHOUT stealing
    // native focus or showing the ring (it was a pointer interaction)
    var rect, x, y, pos, morph, stop = null, item = null, m;
    if (!this.accessibilityEnabled) {return; }
    rect = this.worldCanvas.getBoundingClientRect();
    x = (typeof event.clientX === 'number' ? event.clientX : event.pageX) - rect.left;
    y = (typeof event.clientY === 'number' ? event.clientY : event.pageY) - rect.top;
    if (isNaN(x) || isNaN(y)) {return; }
    pos = new Point(x, y).divideBy((typeof ZOOM === 'number') ? ZOOM : 1);
    morph = this.topMorphAt(pos);
    m = morph;
    while (m) {
        if (m.isFocusable && m.isFocusable() && !m.excludeFromTabRing) {
            stop = m;
            break;
        }
        if (m.isAccessible && m.excludeFromTabRing && !item) {
            item = m; // a clicked option/item inside a composite (block, etc.)
        }
        m = m.parent;
    }
    if (!stop) {return; }
    this.setFocus(stop, {viaKeyboard: false, keepNativeFocus: true});
    if (stop.a11ySetActiveItem && morph && morph !== stop) {
        // hand the composite the clicked descendant - the accessible item if
        // there is one, else the raw click target (e.g. a freshly dropped,
        // not-yet-tagged block); the composite maps it onto its own items
        stop.a11ySetActiveItem(item || morph);
    }
};

// --- the focus manager --------------------------------------------------

WorldMorph.prototype.setFocus = function (morph, options) {
    // programmatic (Morphic-initiated) focus change: also moves NATIVE focus
    options = options || {};
    var viaKeyboard = ('viaKeyboard' in options) ?
            options.viaKeyboard : this.lastInputWasKeyboard,
        prev = this.focusedMorph;

    // moving to a non-text morph ends any active text edit (like the browser
    // blurs a field when you click/tab away)
    if (!options.isText && this.a11yTextEditing && this.stopEditing) {
        this.stopEditing();
    }
    if (prev === morph && !options.force) {
        this.updateFocusRing(viaKeyboard);
        return;
    }
    if (prev && prev.a11yElement) {
        prev.a11yElement.tabIndex = -1;
    }
    if (prev && prev.reactToUnfocus && prev !== morph) {
        prev.reactToUnfocus();
    }
    this.focusedMorph = morph;
    if (morph && morph.a11yElement) {
        morph.a11yElement.tabIndex = 0; // roving: the focused node is tabbable
        // move native focus, unless this is a text edit (the textarea keeps it)
        // or a click (keepNativeFocus: just set the Tab anchor, don't grab focus)
        if (!options.isText && !options.keepNativeFocus &&
                document.activeElement !== morph.a11yElement) {
            this._a11ySyncingFocus = true;
            try {
                morph.a11yElement.focus({preventScroll: true});
            } catch (err) {
                nop();
            }
            this._a11ySyncingFocus = false;
        }
    }
    this.updateFocusRing(viaKeyboard);
    if (morph && morph.reactToFocus) {
        morph.reactToFocus(viaKeyboard);
    }
};

WorldMorph.prototype.setFocusFromDOM = function (morph) {
    // DOM-initiated focus (screen reader / touch / native tab-in). MUST NOT
    // call element.focus() again (that would loop), only mirror into Morphic.
    var prev = this.focusedMorph;
    if (prev === morph) {return; }
    if (prev && prev.a11yElement) {
        prev.a11yElement.tabIndex = -1;
    }
    if (prev && prev.reactToUnfocus) {
        prev.reactToUnfocus();
    }
    this.focusedMorph = morph;
    if (morph && morph.a11yElement) {
        morph.a11yElement.tabIndex = 0;
    }
    this.updateFocusRing(this.lastInputWasKeyboard);
    if (morph && morph.reactToFocus) {
        morph.reactToFocus(this.lastInputWasKeyboard);
    }
};

WorldMorph.prototype.handleA11yBlur = function (morph, relatedTarget) {
    // native focus left this element. If it moved to another tracked element in
    // this world, that element's focusin will take over - do nothing here.
    if (relatedTarget && relatedTarget.morph &&
            relatedTarget.morph.a11yWorld() === this) {
        return;
    }
    if (this.focusedMorph === morph) {
        if (morph.a11yElement) {
            morph.a11yElement.tabIndex = -1;
        }
        if (morph.reactToUnfocus) {
            morph.reactToUnfocus();
        }
        this.focusedMorph = null;
        this.updateFocusRing(false);
    }
};

WorldMorph.prototype.activateAccessible = function (morph, event) {
    // invoked by Enter/Space or an AT "click" - never by a real mouse click
    if (!morph) {return; }
    if (morph.a11yActivate) {
        morph.a11yActivate(event);
    } else if (morph.mouseClickLeft) {
        morph.mouseClickLeft(morph.center());
    }
};

// --- keyboard navigation (roving) ---------------------------------------

WorldMorph.prototype.focusableMorphs = function (scope) {
    // depth-first pre-order walk => reading order.
    // Without a scope: the world's Tab ring; a focus-trapping morph (dialog)
    // is a single stop in it and its contents are NOT descended into. With a
    // scope (a focus-trapping morph): the stops INSIDE that scope, which is
    // what Tab cycles through while focus is in there.
    var result = [],
        preferred;
    function collect(morph) {
        if (!morph.isVisible || morph.a11yIgnore) {return; }
        if (morph.isFocusable && morph.isFocusable() &&
                !morph.excludeFromTabRing) {
            var visible = morph.visibleBounds();
            if (visible.width() > 0 && visible.height() > 0) {
                result.push(morph);
            }
        }
        if (morph.a11yTrapsFocus && morph !== scope) {return; } // opaque
        morph.children.forEach(collect);
    }
    if (scope) {
        scope.children.forEach(collect);
    } else {
        this.children.forEach(collect);
    }
    // order by screen position (top, then left) for a natural Tab order
    result.sort(function (a, b) {
        return a.a11yOrderKey() - b.a11yOrderKey();
    });
    // a scope may dictate its own order (e.g. a dialog: fields, list, then
    // buttons); anything it doesn't mention keeps its screen-order position
    if (scope && scope.a11yTabStops) {
        preferred = scope.a11yTabStops().filter(m => result.indexOf(m) > -1);
        result = preferred.concat(result.filter(m => preferred.indexOf(m) < 0));
    }
    return result;
};

WorldMorph.prototype.a11yFocusScope = function (morph) {
    // answer the focus-trapping morph (e.g. a dialog) that contains the given
    // morph - or, by default, the current focus (the AT focus, or the text
    // being edited) - or null if focus is in the open world
    var m = morph;
    if (!m) {
        m = this.focusedMorph;
        if (this.a11yTextEditing && this.cursor) {
            m = this.cursor.target;
        }
    }
    while (m) {
        if (m.a11yTrapsFocus && m.isVisible) {
            return m;
        }
        m = m.parent;
    }
    return null;
};

WorldMorph.prototype.a11yTabStopFor = function (morph, stops) {
    // the Tab stop that owns the given morph: itself or its nearest ancestor
    // that is in the given list (e.g. the input field around an edited text)
    var m = morph;
    while (m) {
        if (stops.indexOf(m) > -1) {
            return m;
        }
        m = m.parent;
    }
    return null;
};

WorldMorph.prototype.a11yTabWithin = function (scope, from, backwards) {
    // move focus to the next / previous Tab stop inside a focus-trapping
    // scope, wrapping around at either end; answer the new stop (or null)
    var stops = this.focusableMorphs(scope),
        cur = this.a11yTabStopFor(from, stops),
        idx = stops.indexOf(cur),
        next;
    if (!stops.length) {return null; }
    if (idx === -1) {
        next = backwards ? stops[stops.length - 1] : stops[0];
    } else {
        next = stops[(idx + (backwards ? -1 : 1) + stops.length) % stops.length];
    }
    this.setFocus(next, {viaKeyboard: true, force: true});
    return next;
};

WorldMorph.prototype.handleA11yKeydown = function (event) {
    var focused = this.focusedMorph,
        scope,
        list,
        idx,
        next;

    // every keydown counts as keyboard input for the focus-visible heuristic
    this.lastInputWasKeyboard = true;
    if (!this.accessibilityEnabled) {return; }

    // while editing text, defer to the textarea / CursorMorph path - but ONLY
    // while the hidden textarea actually holds focus; once focus has moved to a
    // real a11y element, navigation keys belong to that element.
    // Exception: Tab out of a text field inside a focus-trapping scope (a
    // dialog) moves to the scope's next stop (the legacy CursorMorph path
    // would instead hop to the next editable text anywhere in the world)
    if (this.a11yTextEditing && document.activeElement === this.keyboardHandler) {
        if (event.key === 'Tab' && this.cursor &&
                (scope = this.a11yFocusScope(this.cursor.target))) {
            this.a11yTabWithin(scope, this.cursor.target, event.shiftKey);
            event.preventDefault();
            event.stopPropagation(); // keep it from the textarea's handler
        }
        return;
    }

    // Snap's keyboard-editing mode (ScriptFocusMorph) drives its own
    // navigation through the hidden textarea - defer completely while it does
    if (typeof ScriptFocusMorph !== 'undefined' &&
            this.keyboardFocus instanceof ScriptFocusMorph &&
            document.activeElement === this.keyboardHandler) {
        return;
    }

    // an open menu owns all navigation keys. This mirrors morphic.js's textarea
    // keydown handler (which routes to keyboardFocus): when native focus is on a
    // real a11y element we drive the menu here; when it's still on the hidden
    // textarea we defer to that legacy handler to avoid double-processing.
    if (this.activeMenu || this.keyboardFocus instanceof MenuMorph) {
        if (document.activeElement === this.keyboardHandler) {
            return; // textarea focused -> legacy handler routes to the menu
        }
        if (this.activeMenu && !this.activeMenu.hasFocus) {
            this.activeMenu.getFocus(); // also moves AT focus into the menu
        }
        if (this.keyboardFocus instanceof MenuMorph &&
                this.keyboardFocus.processKeyDown) {
            if (event.keyCode === 9) { // Tab/Shift+Tab move between items too
                if (event.shiftKey) {
                    this.keyboardFocus.selectUp();
                } else {
                    this.keyboardFocus.selectDown();
                }
            } else {
                this.keyboardFocus.processKeyDown(event);
            }
            event.preventDefault();
        }
        return;
    }

    // let a focused composite widget (e.g. combobox) handle its own keys first
    if (focused && focused.a11yHandleKey && focused.a11yHandleKey(event)) {
        event.preventDefault();
        return;
    }

    scope = this.a11yFocusScope(focused);

    // Escape inside a focus-trapping scope (a dialog) is its cancel action
    if (event.key === 'Escape' && scope && scope.a11yEscape) {
        scope.a11yEscape(event);
        event.preventDefault();
        return;
    }

    // Tab / Shift+Tab move through the focusable set
    if (event.key === 'Tab') {
        if (scope) { // trapped: cycle inside the scope, never leave it
            this.a11yTabWithin(scope, focused, event.shiftKey);
            event.preventDefault();
            return;
        }
        list = this.focusableMorphs();
        if (!list.length) {return; }
        idx = list.indexOf(focused);
        if (idx === -1) {
            next = event.shiftKey ? list[list.length - 1] : list[0];
        } else {
            next = event.shiftKey ? list[idx - 1] : list[idx + 1];
        }
        if (next) {
            this.setFocus(next, {viaKeyboard: true});
            event.preventDefault();
        }
        // past either end: fall through, let the browser leave the overlay
        return;
    }

    // Enter / Space activate (native <button>s fire their own click)
    if ((event.key === 'Enter' || event.key === ' ') && focused) {
        if (focused.a11yElement && focused.ariaTag === 'button') {
            return;
        }
        this.activateAccessible(focused, event);
        event.preventDefault();
    }
};

// --- the focus-visible ring ---------------------------------------------

WorldMorph.prototype.updateFocusRing = function (viaKeyboard) {
    var ring = this.focusRing,
        target = this.focusedMorph,
        ringTarget,
        box;

    if (!ring) {return; }
    if (viaKeyboard === undefined) {
        viaKeyboard = this.lastInputWasKeyboard;
    }
    // a composite (e.g. a menu) points the ring at its active item, not itself
    ringTarget = (target && target.a11yActiveTarget) ?
        target.a11yActiveTarget() : target;
    if (!viaKeyboard || !ringTarget || !ringTarget.isVisible ||
            ringTarget === ring || ringTarget.a11yIgnore) {
        if (ring.isVisible) {
            ring.hide();
            ring.changed();
        }
        return;
    }
    box = ringTarget.visibleBounds().expandBy(this.focusRingPadding);
    // round the ring to match the target's own corner radius (buttons round)
    ring.cornerRadius = (typeof ringTarget.corner === 'number' ?
            ringTarget.corner : 4) + this.focusRingPadding;
    ring.setPosition(box.origin);
    ring.setExtent(box.extent());
    if (!ring.isVisible) {
        ring.show();
    }
    // keep the ring on top of any morphs added since it was created
    if (ring.parent === this &&
            this.children[this.children.length - 1] !== ring) {
        this.add(ring);
    }
    ring.changed();
};

// FocusIndicatorMorph ////////////////////////////////////////////////////

/*
    A non-interactive overlay morph that strokes the 2px keyboard focus ring
    around world.focusedMorph. It reuses Morphic's normal damage/redraw
    pipeline (it is an ordinary child of the world) and never participates in
    hit-testing or in the accessibility tree.
*/

var FocusIndicatorMorph;

// FocusIndicatorMorph inherits from Morph:

FocusIndicatorMorph.prototype = new Morph();
FocusIndicatorMorph.prototype.constructor = FocusIndicatorMorph;
FocusIndicatorMorph.uber = Morph.prototype;

function FocusIndicatorMorph() {
    this.init();
}

FocusIndicatorMorph.prototype.init = function () {
    FocusIndicatorMorph.uber.init.call(this);
    this.color = new Color(0, 0, 0, 0); // transparent (render is overridden)
    this.isVisible = false;
    this.isDraggable = false;
    this.a11yIgnore = true; // never in the a11y tree or the tab ring
    this.ringColor = 'rgb(0, 120, 255)';
    this.ringWidth = 2;
    this.cornerRadius = 6; // set per-target by updateFocusRing()
};

FocusIndicatorMorph.prototype.render = function (ctx) {
    var w = this.width(),
        h = this.height(),
        lw = this.ringWidth,
        x = lw / 2,
        y = lw / 2,
        iw = w - lw,
        ih = h - lw,
        r = Math.max(0, Math.min(this.cornerRadius || 0, iw / 2, ih / 2));
    if (w <= lw || h <= lw) {return; }
    ctx.strokeStyle = this.ringColor;
    ctx.lineWidth = lw;
    ctx.beginPath();
    if (r > 0) { // rounded rectangle that hugs the (usually rounded) target
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + iw, y, x + iw, y + ih, r);
        ctx.arcTo(x + iw, y + ih, x, y + ih, r);
        ctx.arcTo(x, y + ih, x, y, r);
        ctx.arcTo(x, y, x + iw, y, r);
        ctx.closePath();
    } else {
        ctx.rect(x, y, iw, ih);
    }
    ctx.stroke();
};

// the ring is click-through: it must never become the topmost morph at a point
FocusIndicatorMorph.prototype.topMorphAt = function () {
    return null;
};

// MenuMorph + MenuItemMorph accessibility ////////////////////////////////

/*
    Expose Morphic menus to the screen reader as an ARIA menu. A menu is a
    composite widget: the menu element keeps native focus and uses
    aria-activedescendant to point at the active item (the WAI-ARIA Authoring
    Practices pattern for menus). Morphic already navigates menus with the
    arrow keys via processKeyDown; we simply mirror its `selection` into
    aria-activedescendant so the screen reader announces each item, and route
    keys into the menu from the global keydown handler when the menu (rather
    than the hidden textarea) holds native focus.

    The hooks below are called from a few small additions inside morphic.js:
    MenuMorph.getFocus / select / destroy / leaveSubmenu.
*/

MenuMorph.prototype.isAccessible = true;
MenuMorph.prototype.ariaRole = 'menu';
MenuMorph.prototype.a11yFocusMode = 'activedescendant';

MenuMorph.prototype.ariaLabel = function () {
    return (typeof this.title === 'string' && this.title.length) ?
        this.title : 'menu';
};

// a ListMorph's contents are also a MenuMorph (isListContents) - there the
// LIST is the accessible listbox and the menu itself stays out of the tree
MenuMorph.prototype.isFocusable = function () {
    return !this.isListContents && Morph.prototype.isFocusable.call(this);
};

MenuMorph.prototype.createAccessibleElement = function () {
    if (this.isListContents) {return; }
    return Morph.prototype.createAccessibleElement.call(this);
};

// the focus ring hugs the highlighted item rather than the whole menu
MenuMorph.prototype.a11yActiveTarget = function () {
    return this.selection || this;
};

MenuMorph.prototype.accessibleItems = function () {
    // my actual MenuItemMorphs, in order (handling a scroll frame)
    var scroller = detect(
        this.children,
        function (m) { return m instanceof ScrollFrameMorph; }
    );
    return (scroller ? scroller.contents.children : this.children).filter(
        function (m) { return m instanceof MenuItemMorph; }
    );
};

MenuMorph.prototype.refreshAccessibleItems = function () {
    // expose item position + count so the screen reader announces "N of M"
    var items = this.accessibleItems(),
        total = items.length;
    items.forEach(function (item, i) {
        if (item.a11yElement) {
            item.a11yElement.setAttribute('aria-setsize', total);
            item.a11yElement.setAttribute('aria-posinset', i + 1);
        }
    });
};

MenuMorph.prototype.enterAccessibleFocus = function () {
    // called from popup(): move AT focus onto the MENU ITSELF, with NO item
    // selected yet, so the screen reader announces "menu, N items" rather than
    // immediately reporting "on a menu item". The first arrow / Tab then moves
    // onto the first option. (Submenus opened with Right arrow still land on
    // their first item, via getFocus, per the menu authoring practices.)
    var world = this.world;
    if (!world || !world.accessibilityEnabled || this.isListContents) {return; }
    if (!this.a11yElement || this.hasFocus) {return; }
    if (!this.accessibleItems().length) {return; } // e.g. a slider-only popup
    world.keyboardFocus = this;
    this.hasFocus = true;
    this.selection = null;
    this.unselectAllItems();
    this.syncAccessibleMenuFocus(); // focuses the menu, clears activedescendant
};

MenuMorph.prototype.syncAccessibleMenuFocus = function () {
    // move native AT focus onto the menu and remember where to return it when
    // the menu chain closes (called from getFocus / leaveSubmenu)
    var world = this.world;
    if (!world || !world.accessibilityEnabled || this.isListContents) {return; }
    if (!this.a11yElement) {return; }
    if (world.focusedMorph && !(world.focusedMorph instanceof MenuMorph)) {
        world._a11yMenuReturnFocus = world.focusedMorph; // the non-menu trigger
        if (world._a11yMenuReturnFocus.a11yElement &&
                world._a11yMenuReturnFocus.a11yElement.hasAttribute('aria-haspopup')) {
            world._a11yMenuReturnFocus.a11yElement.setAttribute(
                'aria-expanded', 'true'); // the trigger button is now expanded
        }
    }
    this.refreshAccessibleItems();
    // cancel any pending textarea-refocus (the right-click mousedown kludge) so
    // it can't steal native focus back from the menu on the next step
    world.onNextStep = null;
    world.setFocus(this, {force: true});
    this.updateActiveDescendant();
};

MenuMorph.prototype.updateActiveDescendant = function () {
    // mirror the current selection into aria-activedescendant (called from
    // select()) so the screen reader announces the active item
    if (!this.a11yElement) {return; }
    if (this.selection && this.selection.isAccessible) {
        this.selection.ensureA11yId();
        if (this.selection.a11yElement) {
            this.setAria('aria-activedescendant', this.selection.a11yId);
        }
        if (this.world && this.world.focusedMorph === this) {
            this.world.updateFocusRing(this.world.lastInputWasKeyboard);
        }
    } else {
        this.setAria('aria-activedescendant', null);
    }
};

MenuMorph.prototype.restoreAccessibleFocus = function () {
    // hand focus back to the trigger once the whole menu chain has closed
    // (called from destroy())
    var world = this.world,
        target;
    if (!world || !world.accessibilityEnabled) {return; }
    // a submenu is closing: collapse its trigger item
    if (this.a11yTriggerItem) {
        if (this.a11yTriggerItem.a11yElement) {
            this.a11yTriggerItem.a11yElement.setAttribute('aria-expanded',
                'false');
        }
        this.a11yTriggerItem = null;
    }
    if (this.isListContents) {return; }
    if (world.activeMenu && world.activeMenu !== this) {return; } // chain open
    target = world._a11yMenuReturnFocus;
    world._a11yMenuReturnFocus = null;
    if (target && target.a11yElement &&
            target.a11yWorld() === world) {
        if (target.a11yElement.hasAttribute('aria-haspopup')) {
            target.a11yElement.setAttribute('aria-expanded', 'false'); // collapsed
        }
        world.setFocus(target, {force: true});
    } else if (world.focusedMorph === this ||
            world.focusedMorph instanceof MenuMorph) {
        world.focusedMorph = null;
        world.updateFocusRing(false);
        if (world.keyboardHandler) { // return native focus to the textarea
            world._a11ySyncingFocus = true;
            try {
                world.keyboardHandler.focus();
            } catch (err) {
                nop();
            }
            world._a11ySyncingFocus = false;
        }
    }
};

MenuItemMorph.prototype.isAccessible = true;
MenuItemMorph.prototype.ariaRole = 'menuitem';
MenuItemMorph.prototype.excludeFromTabRing = true; // the menu owns the tab stop

MenuItemMorph.prototype.ariaLabel = function () {
    if (typeof this.labelString === 'string') {
        return this.labelString;
    }
    if (this.labelString instanceof Array &&
            typeof this.labelString[1] === 'string') {
        return this.labelString[1]; // [icon, string] tuple
    }
    if (this.label && typeof this.label.text === 'string') {
        return this.label.text;
    }
    return null;
};

MenuItemMorph.prototype.createAccessibleElement = function () {
    // an item inside a ListMorph is an option of that list, not a menu item
    if (this.isListItem && this.isListItem()) {
        this.ariaRole = 'option';
    }
    return Morph.prototype.createAccessibleElement.call(this);
};

MenuItemMorph.prototype.updateAccessibleElement = function () {
    Morph.prototype.updateAccessibleElement.call(this);
    if (this.a11yElement && this.action instanceof MenuMorph) {
        // a submenu item: advertise it, and its expanded/collapsed state
        this.a11yElement.setAttribute('aria-haspopup', 'menu');
        if (!this.a11yElement.hasAttribute('aria-expanded')) {
            this.a11yElement.setAttribute('aria-expanded', 'false');
        }
    }
    if (this.a11yElement && this.ariaRole === 'option') {
        this.a11yElement.setAttribute('aria-selected',
            this.userState === 'pressed' ? 'true' : 'false');
    }
};

// ListMorph accessibility ////////////////////////////////////////////////

/*
    A ListMorph (a scrollable list of MenuItemMorphs inside a MenuMorph that
    is flagged isListContents) is exposed as an ARIA listbox: ONE tab stop
    that owns its options via aria-activedescendant. Up / Down (and Home /
    End) move the selection - selecting an item exactly like a click would,
    so a dialog's "show details" list action runs - and Enter fires the
    list's double-click action (e.g. a dialog's default button).

    The hook below is called from a small addition inside morphic.js:
    ListMorph.select.
*/

ListMorph.prototype.isAccessible = true;
ListMorph.prototype.ariaRole = 'listbox';
ListMorph.prototype.a11yFocusMode = 'activedescendant';

ListMorph.prototype.accessibleItems = function () {
    // my actual MenuItemMorphs, in order (skipping separator lines)
    return (this.listContents ? this.listContents.children : []).filter(
        m => m instanceof MenuItemMorph
    );
};

ListMorph.prototype.a11yActiveItem = function () {
    // the currently selected item, if it is (still) one of my items
    var item = this.active;
    return (item instanceof MenuItemMorph &&
        this.accessibleItems().indexOf(item) > -1) ? item : null;
};

ListMorph.prototype.a11yActiveTarget = function () {
    // the focus ring hugs the selected item, else the whole list
    return this.a11yActiveItem() || this;
};

ListMorph.prototype.reactToFocus = function () {
    this.updateActiveDescendant();
};

ListMorph.prototype.updateActiveDescendant = function () {
    // mirror my selection into aria-activedescendant + aria-selected
    // (called from select() and when I gain focus)
    var world = this.a11yWorld(),
        active = this.a11yActiveItem();
    if (!this.a11yElement) {return; }
    this.accessibleItems().forEach(item => {
        if (item.a11yElement) {
            item.a11yElement.setAttribute('aria-selected',
                item === active ? 'true' : 'false');
        }
    });
    if (active) {
        active.ensureA11yId();
        if (active.a11yElement) {
            this.setAria('aria-activedescendant', active.a11yId);
        }
    } else {
        this.setAria('aria-activedescendant', null);
    }
    if (world && world.focusedMorph === this) {
        world.updateFocusRing(world.lastInputWasKeyboard);
    }
};

ListMorph.prototype.a11ySelectItem = function (item) {
    // select an item as if it had been clicked (pressed look + trigger), then
    // make sure AT focus stays on me (a list action may try to move it, e.g.
    // a dialog re-editing its search field)
    var world = this.a11yWorld();
    if (!item) {return; }
    this.listContents.unselectAllItems();
    item.userState = 'pressed';
    item.rerender();
    item.scrollIntoView();
    item.trigger();
    if (world && world.focusedMorph !== this && this.a11yElement) {
        world.setFocus(this, {viaKeyboard: true, force: true});
    }
    this.updateActiveDescendant();
};

ListMorph.prototype.a11yHandleKey = function (event) {
    var items = this.accessibleItems(),
        n = items.length,
        cur = items.indexOf(this.a11yActiveItem()),
        next;
    if (!n) {return false; }
    switch (event.keyCode) {
    case 38: // up
        next = (cur <= 0) ? 0 : cur - 1;
        break;
    case 40: // down
        next = (cur < 0) ? 0 : Math.min(cur + 1, n - 1);
        break;
    case 36: // home
        next = 0;
        break;
    case 35: // end
        next = n - 1;
        break;
    case 13: // enter: the double-click action (e.g. a dialog's default)
        if (cur > -1 && items[cur].doubleClickAction) {
            items[cur].triggerDoubleClick();
            return true;
        }
        return false;
    default:
        return false;
    }
    if (next !== cur) {
        this.a11ySelectItem(items[next]);
    }
    return true;
};
