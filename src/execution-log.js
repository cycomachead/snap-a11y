/*

    execution-log.js

    an "Execution Log" for Snap! - a notebook-style record of the scripts
    a user runs and of what they report

    written by the snap-a11y contributors

    Copyright (C) 2026 by Jens Mönig and the snap-a11y contributors

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


    prerequisites:
    --------------
    needs morphic.js, blocks.js, threads.js, objects.js, scenes.js, gui.js,
    store.js, lists.js, tables.js and extensions.js


    what this is
    ------------
    An extension to Snap!'s "Blocks only" (functions-first) mode: a pane to
    the right of the scripting area that logs - top to bottom, oldest to
    newest, in the manner of a Jupyter notebook - every script the user runs
    (by clicking it, or via the keyboard) together with what it reported:

        * each entry shows a picture of the script, who ran it, when, how it
          ended (done / stopped / error) and the result, rendered like a
          result bubble would (text, booleans, colors, lists & tables,
          costumes, sounds, rings, sprites, pictures, errors)
        * command scripts have no result, but they usually change the
          stage - which is hidden in "blocks only" mode. So each run
          compares a tiny thumbnail of the stage before and after, and
          if it differs (sprites moved or drawn, pen trails, speech
          bubbles, watchers) a picture of the stage after the run becomes
          part of the entry (exportable as PNG)
        * the script picture can be dragged back into the scripting area
          (a fresh copy, just like dragging a block out of a result bubble),
          or added there via the entry's context menu / Enter key
        * results can be exported (text, CSV / JSON, PNG, SVG, WAV, XML)
          or copied; lists can be opened in a table dialog
        * every script, and the whole log as a set of scripts, can be
          exported as XML that Snap! can import again (drop the file onto
          the IDE or use "Import...")

    The extension is loaded by default from snap.html. Everything in this
    file is additive: it defines the new morphs and wraps the handful of
    IDE_Morph / ThreadManager / Process / Scene / SnapSerializer methods it
    needs, so snap.html keeps working if this file is left out.

    settings
    --------
    "Execution Log" is a project setting next to "Blocks only" in the
    settings menu's "Project settings..." submenu (and is saved with the
    project as the scene's executionlog="true" attribute). Turning it on
    also turns "Blocks only" on, because the log takes the place of the
    stage and sprite panes; turning "Blocks only" off turns the log off.

    ExecutionLog.enabledByDefault (below) decides whether new projects
    start with "Blocks only" + "Execution Log" switched on.

    extension primitives (for the "primitive" blocks, see extensions.js):
        log_clear()         - empty the execution log
        log_count()         - number of entries in the log
        log_result(n)       - the value entry #n reported (or an empty text)
        log_script(n)       - entry #n's script as a ring (Context)

*/

/*global modules, IDE_Morph, ThreadManager, Process, Scene, SnapSerializer,
Morph, ScrollFrameMorph, StringMorph, TextMorph, PushButtonMorph, SymbolMorph,
MenuMorph, Color, Point, BlockMorph, ReporterBlockMorph, CommentMorph, List,
ListWatcherMorph, TableFrameMorph, TableMorph, TableDialogMorph, Costume,
SVG_Costume, Sound, Context, SpriteMorph, MorphicPreferences, SnapExtensions,
localize, isNil, isString, isSnapObject, newCanvas, display, navigator, nop,
SyntaxElementMorph, StageHandleMorph, detect*/

/*jshint esversion: 11*/

modules.executionLog = '2026-October-24';

// Global settings /////////////////////////////////////////////////////////

var ExecutionLog = {
    // whether new projects start in "Blocks only" mode with the log shown
    enabledByDefault: false,

    // how many entries to keep before the oldest ones are dropped
    maxEntries: 500,

    // how many characters of a text result to show in an entry
    maxTextLength: 2000,

    // how many characters of a result to put into the accessible label
    maxLabelLength: 300,

    // layout
    minWidth: 220,          // the pane's minimum width in pixels
    defaultWidthRatio: 0.36, // the pane's share of the scripting area
    maxResultHeight: 260,   // for lists & tables
    maxPictureHeight: 220,  // for costumes, pictures, rings

    // stage change detection: when a run changes what the (hidden) stage
    // shows - sprites moved or drawn, pen trails, speech bubbles,
    // watchers - a picture of the stage becomes part of the entry
    detectStageChanges: true,
    stageSignatureExtent: new Point(64, 48), // thumbnail size compared
    stagePictureWidth: 320                   // thumbnail size kept
};

// ExecutionLog helpers ////////////////////////////////////////////////////

ExecutionLog.accentColors = {
    running: new Color(70, 140, 255),
    done: new Color(80, 180, 110),
    stopped: new Color(170, 170, 170),
    error: new Color(220, 70, 70)
};

ExecutionLog.stateLabels = {
    running: 'running',
    done: 'done',
    stopped: 'stopped',
    error: 'error'
};

ExecutionLog.fitExtent = function (width, height, maxWidth, maxHeight) {
    // answer a Point with the given dimensions scaled down (never up) to
    // fit into the given maximum dimensions, keeping the aspect ratio
    var ratio = 1;
    if (width > maxWidth) {
        ratio = maxWidth / width;
    }
    if (height * ratio > maxHeight) {
        ratio = maxHeight / height;
    }
    return new Point(
        Math.max(1, Math.round(width * ratio)),
        Math.max(1, Math.round(height * ratio))
    );
};

ExecutionLog.fitCanvas = function (canvas, maxWidth, maxHeight) {
    // answer the canvas itself if it fits, otherwise a scaled-down copy
    var ext, pic, ctx;
    if (!canvas || !canvas.width || !canvas.height) {
        return newCanvas(new Point(1, 1));
    }
    if (canvas.width <= maxWidth && canvas.height <= maxHeight) {
        return canvas;
    }
    ext = this.fitExtent(canvas.width, canvas.height, maxWidth, maxHeight);
    pic = newCanvas(ext);
    ctx = pic.getContext('2d');
    ctx.drawImage(canvas, 0, 0, ext.x, ext.y);
    return pic;
};

ExecutionLog.imageMorph = function (canvas) {
    // answer a morph displaying the given canvas
    var morph = new Morph();
    morph.isCachingImage = true;
    morph.bounds.setWidth(canvas.width);
    morph.bounds.setHeight(canvas.height);
    morph.cachedImage = canvas;
    return morph;
};

ExecutionLog.framedImageMorph = function (canvas) {
    // answer a morph displaying the given canvas inside a thin frame, so
    // that (partially) transparent pictures still have a visible extent
    var frame = new Morph(),
        pic = this.imageMorph(canvas);
    frame.color = IDE_Morph.prototype.isBright ?
        new Color(200, 200, 200) : new Color(90, 90, 90);
    frame.render = function (ctx) {
        // just an outline, the picture itself may be transparent
        ctx.strokeStyle = this.color.toString();
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, this.width() - 1, this.height() - 1);
    };
    frame.setExtent(new Point(canvas.width + 2, canvas.height + 2));
    pic.setPosition(frame.position().add(1));
    frame.add(pic);
    return frame;
};

ExecutionLog.stageSignature = function (stage) {
    // answer the pixels of a tiny thumbnail of the stage (or null), used
    // to find out whether a run changed what the stage shows
    var ext = this.stageSignatureExtent,
        canvas;
    if (!this.detectStageChanges || !stage) {
        return null;
    }
    try {
        canvas = stage.thumbnail(ext, null, false);
        return canvas.getContext('2d').getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        ).data;
    } catch (err) {
        return null; // e.g. a tainted canvas, treat as "unknown"
    }
};

ExecutionLog.signaturesDiffer = function (a, b) {
    var i;
    if (!a || !b || a.length !== b.length) {
        return false; // unknown, assume nothing changed
    }
    for (i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return true;
        }
    }
    return false;
};

ExecutionLog.stagePicture = function (stage) {
    // answer a canvas showing the stage, as wide as stagePictureWidth
    var ratio = stage.dimensions.y / stage.dimensions.x;
    return stage.thumbnail(new Point(
        this.stagePictureWidth,
        Math.round(this.stagePictureWidth * ratio)
    ));
};

ExecutionLog.isTextual = function (value) {
    return isString(value) || typeof value === 'number' ||
        typeof value === 'boolean' || value instanceof Color;
};

ExecutionLog.text = function (value) {
    // answer a plain text representation of a value for exporting /
    // copying / commenting
    if (isNil(value)) {
        return '';
    }
    if (isString(value)) {
        return value;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (value instanceof List) {
        if (value.canBeCSV()) {
            return value.asCSV();
        }
        if (value.canBeJSON()) {
            return value.asJSON();
        }
        return value.asText();
    }
    return display(value);
};

ExecutionLog.timeString = function (msecs) {
    var d = new Date(msecs),
        pad = n => (n < 10 ? '0' : '') + n;
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' +
        pad(d.getSeconds());
};

ExecutionLog.durationString = function (msecs) {
    if (isNil(msecs)) {
        return '';
    }
    if (msecs < 1000) {
        return msecs + ' ms';
    }
    return (Math.round(msecs / 100) / 10) + ' s';
};

ExecutionLog.writeClipboardText = async function (text, ide) {
    try {
        await navigator.clipboard.writeText(text);
        ide.showMessage('copied to clipboard', 1, true);
    } catch (error) {
        ide.showMessage(error.message, 2, true);
    }
};

// ExecutionLogEntry ///////////////////////////////////////////////////////

/*
    I am the record of one run: a snapshot copy of the script that was
    started, who ran it, when it started and ended, how it ended and
    what it reported. ExecutionLogEntryMorph displays me.
*/

function ExecutionLogEntry(index, topBlock, receiver, stage) {
    this.index = index;
    this.stage = stage || null;
    this.stageBefore = ExecutionLog.stageSignature(this.stage);
    this.stageChanged = false;
    this.stagePicture = null; // a canvas, if the stage changed
    this.script = topBlock.fullCopy(); // a snapshot of the script as run
    this.wasTemplate = topBlock.isTemplate === true; // e.g. a palette block
    this.script.isTemplate = false;
    this.script.isDraggable = true;
    this.isReporter = topBlock instanceof ReporterBlockMorph;
    this.receiver = receiver || null;
    this.receiverName = receiver ? receiver.name : '';
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.state = 'running'; // 'done' | 'stopped' | 'error'
    this.wasStopped = false;
    this.hasResult = false;
    this.result = undefined;
    this.errorText = null;
    this.morph = null; // my ExecutionLogEntryMorph, if displayed
}

ExecutionLogEntry.prototype.finish = function (process) {
    // the process ended by itself or was stopped by the user
    if (this.state !== 'running') {
        return;
    }
    this.finishedAt = Date.now();
    if (this.wasStopped) {
        this.state = 'stopped';
    } else {
        this.state = 'done';
        if (this.isReporter || process.isShowingResult) {
            this.result = process.homeContext.inputs[0];
            this.hasResult = this.result !== undefined;
        }
    }
    this.checkStageChange();
};

ExecutionLogEntry.prototype.checkStageChange = function () {
    // keep a picture of the stage if the run changed what it shows
    var after;
    if (!this.stage || !this.stageBefore) {
        return;
    }
    try { // watchers only refresh when stepped, catch up with them first
        this.stage.watchers().forEach(watcher => watcher.update());
    } catch (err) {
        nop();
    }
    after = ExecutionLog.stageSignature(this.stage);
    if (ExecutionLog.signaturesDiffer(this.stageBefore, after)) {
        this.stageChanged = true;
        try {
            this.stagePicture = ExecutionLog.stagePicture(this.stage);
        } catch (err) {
            this.stagePicture = null;
        }
    }
    this.stageBefore = null; // no longer needed
};

ExecutionLogEntry.prototype.fail = function (error) {
    // the process threw an error
    if (this.state !== 'running') {
        return;
    }
    this.finishedAt = Date.now();
    this.state = 'error';
    this.errorText = localize(error.name) + '\n' + localize(error.message);
    this.checkStageChange();
};

ExecutionLogEntry.prototype.duration = function () {
    return isNil(this.finishedAt) ? null : this.finishedAt - this.startedAt;
};

ExecutionLogEntry.prototype.scriptCopy = function () {
    // answer a fresh copy of the script, ready to be put into a
    // scripting area
    var copy = this.script.fullCopy();
    copy.isTemplate = false;
    copy.isDraggable = true;
    if (this.wasTemplate && copy.reactToTemplateCopy) {
        copy.reactToTemplateCopy(); // same as dragging it out of the palette
    }
    return copy;
};

ExecutionLogEntry.prototype.scriptXML = function (ide) {
    // answer an xml string of the script including its dependencies
    // (custom block definitions), or - if that's not possible because the
    // sprite that ran it no longer exists - just the script
    var xml = null,
        receiver = this.receiver &&
            this.receiver.parentThatIsA(IDE_Morph) === ide ?
                this.receiver : null;
    try {
        xml = this.script.toXMLString(receiver || ide.currentSprite);
    } catch (err) {
        xml = null;
    }
    if (!xml) {
        xml = '<script app="' + ide.serializer.app + '" version="' +
            ide.serializer.version + '">' +
            (this.isReporter ? '<script>' : '') +
            ide.serializer.serialize(this.script) +
            (this.isReporter ? '</script>' : '') +
            '</script>';
    }
    return xml;
};

ExecutionLogEntry.prototype.resultText = function () {
    // answer a plain text version of my result, or null if there isn't
    // a reasonable textual representation (e.g. for a picture)
    var value = this.result;
    if (this.state === 'error') {
        return this.errorText;
    }
    if (!this.hasResult) {
        return null;
    }
    if (ExecutionLog.isTextual(value) || value instanceof List) {
        return ExecutionLog.text(value);
    }
    return null;
};

ExecutionLogEntry.prototype.accessibleText = function (ide) {
    // what a screen reader should say about me
    var txt = localize('run') + ' ' + this.index,
        lines,
        res;
    if (this.receiverName) {
        txt += ', ' + this.receiverName;
    }
    txt += ': ' + (ide.blockAccessibleLabel instanceof Function ?
        ide.blockAccessibleLabel(this.script)
        : this.script.selector);
    if (ide.scriptLines instanceof Function) {
        lines = ide.scriptLines(this.script).length;
        if (lines > 1) {
            txt += ', ' + lines + ' ' + localize('blocks');
        }
    }
    txt += ', ' + localize(ExecutionLog.stateLabels[this.state]);
    if (this.state === 'error') {
        txt += ': ' + this.errorText.replace(/\n/g, ', ');
    } else if (this.hasResult) {
        res = ide.resultAccessibleText instanceof Function ?
            ide.resultAccessibleText(this.result)
            : ExecutionLog.text(this.result);
        if (res) {
            if (res.length > ExecutionLog.maxLabelLength) {
                res = res.slice(0, ExecutionLog.maxLabelLength) + '…';
            }
            txt += ', ' + localize('reports') + ' ' + res;
        }
    }
    if (this.stageChanged) {
        txt += ', ' + localize('the stage changed');
    }
    return txt;
};

// ExecutionLogEntryMorph //////////////////////////////////////////////////

/*
    I am one "cell" of the execution log: a header line, a picture of the
    script (draggable, yielding a copy) and the rendered result.
*/

// ExecutionLogEntryMorph inherits from Morph:

ExecutionLogEntryMorph.prototype = new Morph();
ExecutionLogEntryMorph.prototype.constructor = ExecutionLogEntryMorph;
ExecutionLogEntryMorph.uber = Morph.prototype;

// ExecutionLogEntryMorph preferences settings:

ExecutionLogEntryMorph.prototype.padding = 8;
ExecutionLogEntryMorph.prototype.accentWidth = 4;

// ExecutionLogEntryMorph instance creation:

function ExecutionLogEntryMorph(entry, log) {
    this.init(entry, log);
}

ExecutionLogEntryMorph.prototype.init = function (entry, log) {
    this.entry = entry;
    this.log = log;
    this.ide = log.ide;
    this.builtWidth = null;
    this.scriptPicture = null;
    this.resultMorph = null;
    this.resultValueMorph = null; // the live widget inside, if any
    this.resultHeight = null;
    this.stageMorph = null; // a picture of the stage, if it changed

    ExecutionLogEntryMorph.uber.init.call(this);
    this.isDraggable = false;
    this.acceptsDrops = false;
    this.color = this.cellColor();

    this.accent = new Morph();
    this.add(this.accent);

    this.header = new StringMorph(
        '',
        Math.max(10, SyntaxElementMorph.prototype.fontSize),
        null,
        true // bold
    );
    this.header.color = this.textColor();
    this.add(this.header);

    this.info = new StringMorph(
        '',
        Math.max(9, SyntaxElementMorph.prototype.fontSize - 1),
        null,
        false,
        true // italic
    );
    this.info.color = this.textColor();
    this.add(this.info);

    entry.morph = this;
    this.setWidth(200);
};

ExecutionLogEntryMorph.prototype.cellColor = function () {
    return IDE_Morph.prototype.isBright ?
        new Color(255, 255, 255)
        : this.ide.groupColor.lighter(10);
};

ExecutionLogEntryMorph.prototype.textColor = function () {
    return IDE_Morph.prototype.isBright ?
        new Color(30, 30, 30)
        : new Color(230, 230, 230);
};

// ExecutionLogEntryMorph building:

ExecutionLogEntryMorph.prototype.contentWidth = function () {
    return this.width() - this.accentWidth - this.padding * 2;
};

ExecutionLogEntryMorph.prototype.build = function () {
    // (re)create my script picture and result for my current width
    var entry = this.entry,
        maxWidth = Math.max(40, this.contentWidth());

    if (this.scriptPicture) {
        this.scriptPicture.destroy();
    }
    if (this.resultMorph) {
        this.resultMorph.destroy();
    }
    this.scriptPicture = this.createScriptPicture(maxWidth);
    this.add(this.scriptPicture);
    this.resultMorph = this.createResultMorph(maxWidth);
    if (this.resultMorph) {
        this.add(this.resultMorph);
    }
    if (this.stageMorph) {
        this.stageMorph.destroy();
    }
    this.stageMorph = this.createStageMorph(maxWidth);
    if (this.stageMorph) {
        this.add(this.stageMorph);
    }
    this.header.text = this.headerText();
    this.header.fixLayout(true); // just me, don't re-layout the cell
    this.header.rerender();
    this.info.text = this.infoText();
    this.info.fixLayout(true);
    this.info.rerender();
    this.accent.color = ExecutionLog.accentColors[entry.state];
    this.builtWidth = this.width();
    this.resultHeight = this.resultMorph ? this.resultMorph.height() : 0;
    this.updateAccessible();
};

ExecutionLogEntryMorph.prototype.headerText = function () {
    var entry = this.entry,
        txt = '[' + entry.index + ']';
    if (entry.receiverName) {
        txt += '  ' + entry.receiverName;
    }
    return txt;
};

ExecutionLogEntryMorph.prototype.infoText = function () {
    var entry = this.entry,
        txt = ExecutionLog.timeString(entry.startedAt) + '  ·  ' +
            localize(ExecutionLog.stateLabels[entry.state]);
    if (entry.state !== 'running') {
        txt += '  ·  ' + ExecutionLog.durationString(entry.duration());
    }
    return txt;
};

ExecutionLogEntryMorph.prototype.createScriptPicture = function (maxWidth) {
    // a picture of the script that can be dragged out as a fresh copy
    var entry = this.entry,
        ide = this.ide,
        pic = ExecutionLog.fitCanvas(
            entry.script.scriptPic(),
            maxWidth,
            Number.MAX_SAFE_INTEGER
        ),
        morph = ExecutionLog.imageMorph(pic);

    morph.isDraggable = !SpriteMorph.prototype.disableDraggingData;
    morph.selectForEdit = function () {
        // answer a copy of the script to be grabbed instead of me
        var script = entry.scriptCopy(),
            prepare = script.prepareToBeGrabbed;

        script.prepareToBeGrabbed = function (hand) {
            prepare.call(this, hand);
            hand.grabOrigin = {
                origin: ide.palette,
                position: ide.palette.center()
            };
            this.prepareToBeGrabbed = prepare;
        };

        script.setPosition(this.position());
        return script;
    };
    return morph;
};

ExecutionLogEntryMorph.prototype.createResultMorph = function (maxWidth) {
    // answer a morph displaying the result (or the error), or null
    var entry = this.entry,
        fontSize = Math.max(10, SyntaxElementMorph.prototype.fontSize),
        morph;

    this.resultValueMorph = null;
    if (entry.state === 'running') {
        return null;
    }
    if (entry.state === 'error') {
        morph = new TextMorph(
            entry.errorText,
            fontSize,
            null,
            false,
            false,
            'left',
            maxWidth
        );
        morph.color = ExecutionLog.accentColors.error;
        morph.fixLayout();
        morph.rerender();
        return morph;
    }
    if (!entry.hasResult) {
        return null;
    }
    morph = this.renderValue(entry.result, maxWidth, fontSize);
    return morph;
};

ExecutionLogEntryMorph.prototype.createStageMorph = function (maxWidth) {
    // a captioned picture of the stage, if the run changed it
    var entry = this.entry,
        morph,
        caption,
        pic;
    if (!entry.stageChanged || !entry.stagePicture) {
        return null;
    }
    morph = new Morph();
    morph.color = new Color(0, 0, 0, 0);
    caption = new StringMorph(
        localize('stage') + ':',
        Math.max(9, SyntaxElementMorph.prototype.fontSize - 1),
        null,
        false,
        true // italic
    );
    caption.color = this.textColor();
    morph.add(caption);
    pic = ExecutionLog.framedImageMorph(ExecutionLog.fitCanvas(
        entry.stagePicture,
        maxWidth - 2,
        ExecutionLog.maxPictureHeight
    ));
    pic.setPosition(caption.bottomLeft().add(new Point(0, 2)));
    morph.add(pic);
    morph.bounds.setWidth(Math.max(caption.width(), pic.width()));
    morph.bounds.setHeight(pic.bottom() - caption.top());
    return morph;
};

ExecutionLogEntryMorph.prototype.renderValue = function (
    value,
    maxWidth,
    fontSize
) {
    // mirror what a result bubble would show for the value
    var ide = this.ide,
        maxPic = ExecutionLog.maxPictureHeight,
        morph,
        widget,
        img,
        ext,
        txt;

    if (value instanceof List) {
        if (value.isTable()) {
            widget = new TableFrameMorph(new TableMorph(value));
        } else {
            widget = new ListWatcherMorph(value);
            widget.update(true);
        }
        widget.isDraggable = false;
        widget.expand(new Point(maxWidth, ExecutionLog.maxResultHeight));
        this.resultValueMorph = widget;
        return widget;
    }
    if (value instanceof Context) {
        img = ExecutionLog.fitCanvas(value.image(), maxWidth, maxPic);
        morph = ExecutionLog.imageMorph(img);
        morph.isDraggable = !SpriteMorph.prototype.disableDraggingData;
        morph.selectForEdit = function () {
            var script = value.toUserBlock(),
                prepare = script.prepareToBeGrabbed;
            script.prepareToBeGrabbed = function (hand) {
                prepare.call(this, hand);
                hand.grabOrigin = {
                    origin: ide.palette,
                    position: ide.palette.center()
                };
                this.prepareToBeGrabbed = prepare;
            };
            script.setPosition(this.position());
            return script;
        };
        return morph;
    }
    if (value instanceof Costume) {
        ext = ExecutionLog.fitExtent(
            value.width(),
            value.height(),
            maxWidth - 2,
            maxPic
        );
        return ExecutionLog.framedImageMorph(
            value.thumbnail(ext, null, true)
        );
    }
    if (value instanceof Sound) {
        morph = new SymbolMorph('notes', 30);
        morph.color = this.textColor();
        return morph;
    }
    if (value instanceof Morph) {
        if (isSnapObject(value)) {
            img = value.thumbnail(new Point(60, 60));
            morph = ExecutionLog.framedImageMorph(img);
        } else {
            img = ExecutionLog.fitCanvas(
                value.fullImage(),
                maxWidth - 2,
                maxPic
            );
            morph = value instanceof BlockMorph ?
                ExecutionLog.imageMorph(img)
                : ExecutionLog.framedImageMorph(img);
        }
        if (value instanceof BlockMorph) {
            morph.isDraggable = !SpriteMorph.prototype.disableDraggingData;
            morph.selectForEdit = function () {
                var script = value.fullCopy(),
                    prepare = script.prepareToBeGrabbed;
                script.prepareToBeGrabbed = function (hand) {
                    prepare.call(this, hand);
                    hand.grabOrigin = {
                        origin: ide.palette,
                        position: ide.palette.center()
                    };
                    this.prepareToBeGrabbed = prepare;
                };
                script.setPosition(this.position());
                return script;
            };
        }
        return morph;
    }
    if (typeof value === 'boolean') {
        return SpriteMorph.prototype.booleanMorph.call(null, value);
    }
    if (value instanceof Color) {
        return SpriteMorph.prototype.colorSwatch(value, fontSize * 1.4);
    }
    // text, numbers and everything else
    txt = isString(value) ? value : display(value);
    if (txt.length > ExecutionLog.maxTextLength) {
        txt = txt.slice(0, ExecutionLog.maxTextLength) + '…';
    }
    if (txt === '') {
        txt = localize('an empty text');
    }
    morph = new TextMorph(
        txt,
        fontSize,
        null,
        false,
        false,
        'left',
        maxWidth
    );
    morph.color = this.textColor();
    morph.isItalic = (value === '');
    morph.fixLayout();
    morph.rerender();
    return morph;
};

// ExecutionLogEntryMorph layout:

ExecutionLogEntryMorph.prototype.fixLayout = function () {
    var pad = this.padding,
        x = this.left() + this.accentWidth + pad,
        y = this.top() + pad;

    if (this.builtWidth !== this.width() || !this.scriptPicture) {
        this.build();
    }
    this.header.setPosition(new Point(x, y));
    this.info.setPosition(new Point(
        x + this.header.width() + pad,
        y + Math.round((this.header.height() - this.info.height()) / 2)
    ));
    y += Math.max(this.header.height(), this.info.height()) + pad;
    this.scriptPicture.setPosition(new Point(x, y));
    y += this.scriptPicture.height() + pad;
    if (this.resultMorph) {
        this.resultMorph.setPosition(new Point(x, y));
        y += this.resultMorph.height() + pad;
    }
    if (this.stageMorph) {
        this.stageMorph.setPosition(new Point(x, y));
        y += this.stageMorph.height() + pad;
    }
    this.bounds.setHeight(Math.ceil(y - this.top()));
    this.accent.setPosition(this.position());
    this.accent.setExtent(new Point(this.accentWidth, this.height()));
    this.changed();
};

ExecutionLogEntryMorph.prototype.update = function () {
    // my entry's state has changed (it finished or failed)
    this.builtWidth = null; // force a rebuild
    this.log.fixLayout();
};

ExecutionLogEntryMorph.prototype.step = function () {
    // live list watchers may change their size, keep the layout in sync
    var h;
    if (this.resultMorph && !isNil(this.resultHeight)) {
        h = this.resultMorph.height();
        if (h !== this.resultHeight) {
            this.resultHeight = h;
            this.log.fixLayout();
        }
    }
};

// ExecutionLogEntryMorph accessibility:

ExecutionLogEntryMorph.prototype.updateAccessible = function () {
    // one Tab stop per entry; Enter / Space adds the script to the
    // scripting area (the keyboard equivalent of dragging the picture).
    // Called when I'm (re)built, i.e. whenever my entry changes.
    var myself = this;
    if (!(this.setAriaLabel instanceof Function)) {
        return; // accessibility.js isn't loaded
    }
    if (!this.isAccessible) {
        this.isAccessible = true;
        this.ariaRole = 'group';
        this.ariaTag = 'div';
        this.a11yActivate = function () {
            myself.ide.executionLogAddScript(myself.entry);
        };
    }
    this.setAriaLabel(this.entry.accessibleText(this.ide));
    this.ensureAccessible();
};

ExecutionLogEntryMorph.prototype.ensureAccessible = function () {
    // create my parallel DOM node once I'm part of an accessible world
    if (this.isAccessible && !this.a11yElement &&
            this.createAccessibleElement instanceof Function) {
        this.createAccessibleElement();
    }
};

// ExecutionLogEntryMorph menu:

ExecutionLogEntryMorph.prototype.userMenu = function () {
    var menu = new MenuMorph(this),
        ide = this.ide,
        entry = this.entry,
        world = this.world(),
        value = entry.result,
        txt;

    if (ide.isAppMode) {
        return null;
    }
    menu.addItem(
        'add script to scripting area',
        () => ide.executionLogAddScript(entry),
        'put a copy of this script\ninto the scripting area'
    );
    menu.addItem(
        'export script...',
        () => ide.executionLogExportScript(entry),
        'save this script as an\nXML file to import again'
    );
    if (entry.hasResult || entry.state === 'error') {
        menu.addLine();
        if (entry.hasResult) {
            menu.addItem(
                'export result...',
                () => ide.executionLogExportResult(entry),
                'save the result as a file'
            );
        }
        txt = entry.resultText();
        if (!isNil(txt)) {
            menu.addItem(
                'copy result',
                () => ExecutionLog.writeClipboardText(txt, ide),
                'copy the result as text\nto the clipboard'
            );
        }
        if (value instanceof List && List.prototype.enableTables) {
            menu.addItem(
                'open result in dialog...',
                () => new TableDialogMorph(value).popUp(world)
            );
        }
    }
    if (entry.stageChanged && entry.stagePicture) {
        menu.addItem(
            'export stage picture...',
            () => ide.saveCanvasAs(
                entry.stagePicture,
                ide.executionLogFileName(entry) + ' ' + localize('stage')
            ),
            'save the picture of the stage\nafter this run as a PNG file'
        );
    }
    menu.addLine();
    menu.addItem(
        'delete entry',
        () => ide.executionLogDeleteEntry(entry),
        'remove this entry from the log'
    );
    return menu;
};

// ExecutionLogMorph ///////////////////////////////////////////////////////

/*
    I am the execution log pane: a toolbar and a scrolling list of
    ExecutionLogEntryMorphs, oldest at the top, newest at the bottom.
*/

// ExecutionLogMorph inherits from Morph:

ExecutionLogMorph.prototype = new Morph();
ExecutionLogMorph.prototype.constructor = ExecutionLogMorph;
ExecutionLogMorph.uber = Morph.prototype;

// ExecutionLogMorph preferences settings:

ExecutionLogMorph.prototype.margin = 6;
ExecutionLogMorph.prototype.gap = 6;

// ExecutionLogMorph instance creation:

function ExecutionLogMorph(ide) {
    this.init(ide);
}

ExecutionLogMorph.prototype.init = function (ide) {
    var myself = this,
        colors = IDE_Morph.prototype.isBright ? ide.tabColors
            : [
                ide.groupColor,
                ide.frameColor.darker(50),
                ide.frameColor.darker(50)
            ];

    this.ide = ide;
    this.autoScroll = true; // scroll to the newest entry on changes
    this.isLaidOut = false;
    this.buttons = [];

    ExecutionLogMorph.uber.init.call(this);
    this.color = ide.groupColor;
    this.isDraggable = false;
    this.acceptsDrops = false;

    // toolbar
    this.toolbar = new Morph();
    this.toolbar.color = ide.frameColor;
    this.add(this.toolbar);

    this.label = new StringMorph(
        localize('Execution Log'),
        12,
        null,
        true
    );
    this.label.color = ide.buttonLabelColor;
    this.toolbar.add(this.label);

    function makeButton(action, symbol, hint) {
        var button = new PushButtonMorph(
            myself,
            action,
            new SymbolMorph(symbol, 14)
        );
        button.corner = 12;
        button.color = colors[0];
        button.highlightColor = colors[1];
        button.pressColor = colors[2];
        button.labelMinExtent = new Point(36, 18);
        button.padding = 0;
        button.labelShadowOffset = new Point(-1, -1);
        button.labelShadowColor = colors[1];
        button.labelColor = ide.buttonLabelColor;
        button.contrast = ide.buttonContrast;
        button.hint = hint;
        button.fixLayout();
        myself.toolbar.add(button);
        myself.buttons.push(button);
        return button;
    }

    this.exportButton = makeButton(
        'popUpExportMenu',
        'file',
        'export the logged scripts'
    );
    this.clearButton = makeButton(
        'userClear',
        'trash',
        'clear the execution log'
    );

    // scrolling list of entries
    this.frame = new ScrollFrameMorph(null, null, ide.sliderColor);
    this.frame.color = ide.groupColor;
    this.frame.isDraggable = false;
    this.frame.acceptsDrops = false;
    this.frame.contents.acceptsDrops = false;
    this.frame.contents.color = ide.groupColor;
    this.frame.padding = 0;
    this.frame.growth = 0;
    this.add(this.frame);

    this.setExtent(new Point(300, 300));
};

// ExecutionLogMorph entries:

ExecutionLogMorph.prototype.entryMorphs = function () {
    return this.frame.contents.children.filter(
        m => m instanceof ExecutionLogEntryMorph
    );
};

ExecutionLogMorph.prototype.addEntry = function (entry) {
    var morph = new ExecutionLogEntryMorph(entry, this);
    this.frame.contents.add(morph);
    this.autoScroll = true;
    this.fixLayout();
};

ExecutionLogMorph.prototype.removeEntry = function (entry) {
    if (entry.morph) {
        entry.morph.destroy();
        entry.morph = null;
    }
    this.fixLayout();
};

ExecutionLogMorph.prototype.rebuild = function (entries) {
    // display the given entries from scratch, e.g. after the IDE's
    // panes have been recreated
    this.frame.contents.children.slice().forEach(m => m.destroy());
    entries.forEach(entry => {
        this.frame.contents.add(new ExecutionLogEntryMorph(entry, this));
    });
    this.autoScroll = true;
    this.fixLayout();
};

ExecutionLogMorph.prototype.clear = function () {
    this.frame.contents.children.slice().forEach(m => m.destroy());
    this.fixLayout();
};

// ExecutionLogMorph layout:

ExecutionLogMorph.prototype.fixLayout = function () {
    var tb = this.toolbar,
        pad = 5,
        x;

    tb.setPosition(this.position());
    tb.setExtent(new Point(this.width(), this.ide.logo.height()));
    this.label.setCenter(tb.center());
    this.label.setLeft(tb.left() + pad + 2);
    x = tb.right() - pad;
    this.buttons.slice().reverse().forEach(button => {
        button.setCenter(tb.center());
        button.setRight(x);
        x = button.left() - pad;
    });

    this.frame.setPosition(tb.bottomLeft());
    this.frame.setExtent(new Point(
        this.width(),
        Math.max(0, this.height() - tb.height())
    ));
    this.fixEntriesLayout();
};

ExecutionLogMorph.prototype.fixEntriesLayout = function () {
    var frame = this.frame,
        contents = frame.contents,
        margin = this.margin,
        width = Math.max(
            40,
            frame.width() - frame.scrollBarSize - margin * 2
        ),
        offset = this.isLaidOut ? Math.max(0, frame.top() - contents.top())
            : 0, // keep the current scroll position
        y;

    // anchor the contents to the frame (minus the scroll offset)
    contents.setPosition(new Point(frame.left(), frame.top() - offset));
    y = contents.top() + margin;
    this.entryMorphs().forEach(morph => {
        morph.setPosition(new Point(contents.left() + margin, y));
        morph.setWidth(width);
        morph.fixLayout();
        y += morph.height() + this.gap;
    });
    contents.bounds.setWidth(frame.width());
    contents.bounds.setHeight(Math.max(
        frame.height(),
        y - contents.top() + margin - this.gap
    ));
    this.isLaidOut = true;
    if (this.autoScroll) {
        this.scrollToBottom();
        this.autoScroll = false;
    } else {
        contents.keepInScrollFrame();
    }
    this.frame.adjustScrollBars();
    this.entryMorphs().forEach(morph => morph.ensureAccessible());
};

ExecutionLogMorph.prototype.scrollToBottom = function () {
    var contents = this.frame.contents;
    if (contents.height() > this.frame.height()) {
        contents.setPosition(new Point(
            contents.left(),
            this.frame.bottom() - contents.height()
        ));
    } else {
        contents.setPosition(new Point(contents.left(), this.frame.top()));
    }
    contents.keepInScrollFrame();
};

// ExecutionLogMorph actions:

ExecutionLogMorph.prototype.userClear = function () {
    this.ide.clearExecutionLog();
};

ExecutionLogMorph.prototype.exportMenu = function () {
    var menu = new MenuMorph(this),
        ide = this.ide,
        count = ide.executionLogEntries().length;

    if (count) {
        menu.addItem(
            'export all scripts...',
            () => ide.exportExecutionLogScripts(false),
            'save every logged script\nas one XML file'
        );
        menu.addItem(
            'export all scripts with results...',
            () => ide.exportExecutionLogScripts(true),
            'save every logged script\nwith its result attached\nas a comment'
        );
        menu.addLine();
        menu.addItem(
            'clear',
            () => ide.clearExecutionLog(),
            'remove all entries'
        );
    } else {
        menu.addItem(localize('the execution log is empty'), null);
    }
    return menu;
};

ExecutionLogMorph.prototype.popUpExportMenu = function () {
    var world = this.world();
    if (!world) {
        return;
    }
    this.exportMenu().popup(world, this.exportButton.bottomLeft());
};

ExecutionLogMorph.prototype.userMenu = function () {
    if (this.ide.isAppMode) {
        return null;
    }
    return this.exportMenu();
};

// ExecutionLogHandleMorph /////////////////////////////////////////////////

// I am a horizontal resizing handle for the execution log pane.
// I pseudo-inherit my looks from StageHandleMorph.

// ExecutionLogHandleMorph inherits from Morph:

ExecutionLogHandleMorph.prototype = new Morph();
ExecutionLogHandleMorph.prototype.constructor = ExecutionLogHandleMorph;
ExecutionLogHandleMorph.uber = Morph.prototype;

// ExecutionLogHandleMorph instance creation:

function ExecutionLogHandleMorph(target) {
    this.init(target);
}

ExecutionLogHandleMorph.prototype.init = function (target) {
    this.target = target || null;
    this.offset = null;
    this.userState = 'normal';
    ExecutionLogHandleMorph.uber.init.call(this);
    this.color = IDE_Morph.prototype.isBright ?
            IDE_Morph.prototype.backgroundColor : new Color(190, 190, 190);
    this.isDraggable = false;
    this.setExtent(new Point(12, 50));
};

// ExecutionLogHandleMorph drawing (borrowed from the stage handle):

ExecutionLogHandleMorph.prototype.render = function (ctx) {
    if (typeof StageHandleMorph !== 'undefined') {
        StageHandleMorph.prototype.render.call(this, ctx);
    }
};

ExecutionLogHandleMorph.prototype.renderOn = function (ctx, color, shadow) {
    StageHandleMorph.prototype.renderOn.call(this, ctx, color, shadow);
};

// ExecutionLogHandleMorph layout:

ExecutionLogHandleMorph.prototype.fixLayout = function () {
    if (!this.target) {return; }
    var ide = this.target.ide;
    this.setTop(this.target.top() + 10);
    this.setRight(this.target.left());
    if (ide) {ide.add(this); } // come to front
};

// ExecutionLogHandleMorph events:

ExecutionLogHandleMorph.prototype.mouseEnter = function () {
    this.userState = 'highlight';
    this.rerender();
};

ExecutionLogHandleMorph.prototype.mouseLeave = function () {
    this.userState = 'normal';
    this.rerender();
};

ExecutionLogHandleMorph.prototype.mouseDownLeft = function (pos) {
    this.offset = this.right() - pos.x;
    this.lockMouseFocus();
};

ExecutionLogHandleMorph.prototype.mouseMove = function (pos) {
    var ide = this.target.ide,
        newPos = pos.x + this.offset;
    ide.executionLogWidth = Math.max(
        ExecutionLog.minWidth,
        this.target.right() - newPos
    );
    ide.fixLayout();
};

ExecutionLogHandleMorph.prototype.mouseDoubleClick = function () {
    var ide = this.target.ide;
    ide.executionLogWidth = null; // back to the default width
    ide.fixLayout();
};

// IDE_Morph - the execution log pane ///////////////////////////////////////

IDE_Morph.prototype.executionLogEntries = function () {
    if (!this._executionLogEntries) {
        this._executionLogEntries = [];
        this._executionLogNextIndex = 1;
    }
    return this._executionLogEntries;
};

IDE_Morph.prototype.createExecutionLog = function () {
    if (this.executionLog) {
        this.executionLog.destroy();
    }
    if (this.executionLogHandle) {
        this.executionLogHandle.destroy();
    }
    this.executionLog = new ExecutionLogMorph(this);
    this.executionLog.hide();
    this.add(this.executionLog);
    this.executionLogHandle = new ExecutionLogHandleMorph(this.executionLog);
    this.executionLogHandle.hide();
    this.add(this.executionLogHandle);
    this.executionLog.rebuild(this.executionLogEntries());
};

IDE_Morph.prototype.isExecutionLogActive = function () {
    return !!(this.executionLog && this.scene && this.scene.executionLog);
};

IDE_Morph.prototype.isExecutionLogShown = function () {
    // the log replaces the stage & sprite panes, so it only shows in
    // "blocks only" mode, and never in presentation (app) mode
    return this.isExecutionLogActive() &&
        !!this.config.noSprites &&
        !this.isAppMode &&
        !this.isEmbedMode &&
        !this.performerMode;
};

IDE_Morph.prototype.toggleExecutionLog = function (choice) {
    // choice is optional, defaults to toggling the current state
    choice = isNil(choice) ? !this.scene.executionLog : (choice === true);
    this.scene.executionLog = choice;
    if (choice && !this.scene.hideSprites) {
        this.hideSpritePanes(true); // calls fixLayout()
    } else {
        this.fixLayout();
    }
    if (choice && this.executionLog) {
        this.executionLog.autoScroll = true;
        this.executionLog.fixLayout();
    }
};

IDE_Morph.prototype.fixExecutionLogLayout = function (situation) {
    // called at the end of fixLayout(): carve the log pane out of the
    // scripting area's width when the log is shown
    var log = this.executionLog,
        handle = this.executionLogHandle,
        editor = this.spriteEditor,
        padding = this.padding,
        border = this.config.border || 0,
        minEditorWidth = 200,
        width;

    if (!log || situation === 'refreshPalette') {
        return;
    }
    if (!this.isExecutionLogShown() || !editor || !editor.isVisible) {
        if (log.isVisible) {
            log.hide();
        }
        if (handle && handle.isVisible) {
            handle.hide();
        }
        return;
    }
    width = this.executionLogWidth ||
        Math.round(editor.width() * ExecutionLog.defaultWidthRatio);
    width = Math.min(width, editor.width() - minEditorWidth - padding);
    width = Math.max(width, ExecutionLog.minWidth);
    if (editor.width() - width - padding < minEditorWidth) {
        // very narrow window: give the scripting area what it needs
        width = Math.max(40, editor.width() - minEditorWidth - padding);
    }
    editor.setWidth(editor.width() - width - padding);
    log.setPosition(new Point(editor.right() + padding, editor.top()));
    log.setExtent(new Point(
        Math.max(40, this.right() - border - log.left()),
        editor.height()
    ));
    if (!log.isVisible) {
        log.show();
    }
    log.fixLayout();
    if (handle) {
        if (!handle.isVisible) {
            handle.show();
        }
        handle.fixLayout();
    }
};

// IDE_Morph - logging runs

IDE_Morph.prototype.logExecution = function (process, topBlock, receiver) {
    // record a new run and answer its entry (or null)
    var entries = this.executionLogEntries(),
        entry;
    if (!this.isExecutionLogActive() || !(topBlock instanceof BlockMorph)) {
        return null;
    }
    try {
        entry = new ExecutionLogEntry(
            this._executionLogNextIndex,
            topBlock,
            receiver,
            this.stage
        );
    } catch (err) {
        return null; // never break running a script over logging it
    }
    this._executionLogNextIndex += 1;
    entries.push(entry);
    process.executionLogEntry = entry;
    while (entries.length > ExecutionLog.maxEntries) {
        this.executionLog.removeEntry(entries.shift());
    }
    this.executionLog.addEntry(entry);
    return entry;
};

IDE_Morph.prototype.executionLogEntryChanged = function (entry) {
    if (entry.morph) {
        entry.morph.update();
    }
};

IDE_Morph.prototype.clearExecutionLog = function () {
    this.executionLogEntries().length = 0;
    if (this.executionLog) {
        this.executionLog.clear();
    }
};

IDE_Morph.prototype.executionLogDeleteEntry = function (entry) {
    var entries = this.executionLogEntries(),
        idx = entries.indexOf(entry);
    if (idx > -1) {
        entries.splice(idx, 1);
    }
    if (this.executionLog) {
        this.executionLog.removeEntry(entry);
    }
};

IDE_Morph.prototype.executionLogAddScript = function (entry) {
    // put a copy of the entry's script into the current scripting area,
    // below the existing scripts
    var scripts = this.currentSprite.scripts,
        script = entry.scriptCopy(),
        world = this.world(),
        bottom = scripts.top() + 20,
        blocks = scripts.children.filter(m => m instanceof BlockMorph);

    blocks.forEach(block => {
        bottom = Math.max(bottom, block.fullBounds().bottom() + 20);
    });
    script.setPosition(new Point(scripts.left() + 20, bottom));
    scripts.add(script);
    script.fixBlockColor(null, true);
    scripts.adjustBounds();
    script.scrollIntoView();
    this.recordUnsavedChanges();
    if (world && world.announce instanceof Function &&
            world.accessibilityEnabled) {
        world.announce(localize('script added to the scripting area'));
    }
    if (this.setAccessibleScripts instanceof Function) {
        this.setAccessibleScripts();
    }
    return script;
};

// IDE_Morph - exporting from the execution log

IDE_Morph.prototype.executionLogFileName = function (entry) {
    return (this.getProjectName() || localize('untitled')) + ' ' +
        localize('run') + ' ' + entry.index;
};

IDE_Morph.prototype.executionLogExportScript = function (entry) {
    var xml = entry.scriptXML(this);
    if (xml) {
        this.saveXMLAs(xml, this.executionLogFileName(entry) + ' script');
    }
};

IDE_Morph.prototype.executionLogExportResult = function (entry) {
    var value = entry.result,
        name = this.executionLogFileName(entry) + ' ' + localize('result'),
        block;

    if (!entry.hasResult) {
        return;
    }
    if (value instanceof List) {
        if (value.canBeCSV()) {
            this.saveFileAs(value.asCSV(), 'text/csv;charset=utf-8', name);
        } else if (value.canBeJSON()) {
            this.saveFileAs(value.asJSON(), 'text/json;charset=utf-8', name);
        } else {
            this.saveFileAs(
                value.asText(),
                'text/plain;charset=utf-8',
                name
            );
        }
    } else if (value instanceof Costume) {
        if (value instanceof SVG_Costume) {
            this.saveFileAs(value.contents.src, 'text/svg', name);
        } else {
            this.saveCanvasAs(value.contents, name);
        }
    } else if (value instanceof Sound) {
        this.saveAudioAs(value.audio, name);
    } else if (value instanceof Context) {
        block = value.toUserBlock();
        this.saveXMLAs(
            block.toXMLString(this.currentSprite) ||
                ('<script app="' + this.serializer.app + '" version="' +
                    this.serializer.version + '"><script>' +
                    this.serializer.serialize(block) + '</script></script>'),
            name
        );
    } else if (value instanceof BlockMorph) {
        this.saveXMLAs(
            value.toXMLString(this.currentSprite) ||
                this.serializer.serialize(value),
            name
        );
    } else if (value instanceof Morph) {
        this.saveCanvasAs(value.fullImage(), name);
    } else {
        this.saveFileAs(
            ExecutionLog.text(value),
            'text/plain;charset=utf-8',
            name
        );
    }
};

IDE_Morph.prototype.executionLogScriptsXML = function (withResults) {
    // answer a <scriptsonly> xml string of all logged scripts, laid out
    // top to bottom, optionally with each result attached as a comment
    var serializer = this.serializer,
        scale = SyntaxElementMorph.prototype.scale,
        y = 20,
        xml = '';

    this.executionLogEntries().forEach(entry => {
        var script = entry.scriptCopy(),
            txt,
            comment,
            scriptXML;
        if (withResults) {
            txt = entry.resultText();
            if (isNil(txt) && entry.hasResult) {
                txt = localize('(result cannot be shown as text)');
            }
            if (entry.stageChanged) {
                txt = (isNil(txt) ? '' : txt + '\n') +
                    localize('(the stage changed)');
            }
            if (!isNil(txt)) {
                if (txt.length > ExecutionLog.maxTextLength) {
                    txt = txt.slice(0, ExecutionLog.maxTextLength) + '…';
                }
                comment = new CommentMorph(
                    '[' + entry.index + '] ' +
                        localize(ExecutionLog.stateLabels[entry.state]) +
                        ':\n' + txt
                );
                script.comment = comment;
                comment.block = script;
            }
        }
        // reporters serialize as a bare <block>, commands as a <script>,
        // position the scripts one below the other
        scriptXML = serializer.serialize(script);
        if (scriptXML.indexOf('<script>') === 0) {
            scriptXML = scriptXML.slice('<script>'.length, -'</script>'.length);
        }
        xml += serializer.format('<script x="@" y="@">', 20, y) +
            scriptXML + '</script>';
        y += Math.round(script.stackFullBounds().height() / scale) + 30;
        if (comment) {
            y += Math.round(comment.height() / scale);
        }
    });
    return '<scriptsonly app="' + serializer.app + '" version="' +
        serializer.version + '">' + xml + '</scriptsonly>';
};

IDE_Morph.prototype.exportExecutionLogScripts = function (withResults) {
    if (!this.executionLogEntries().length) {
        this.showMessage('the execution log is empty', 1);
        return;
    }
    this.saveXMLAs(
        this.executionLogScriptsXML(withResults),
        (this.getProjectName() || localize('untitled')) + ' ' +
            localize('execution log')
    );
};

// IDE_Morph - wiring the pane into the IDE ////////////////////////////////

(function () {
    var origBuildPanes = IDE_Morph.prototype.buildPanes,
        origFixLayout = IDE_Morph.prototype.fixLayout,
        origHideSpritePanes = IDE_Morph.prototype.hideSpritePanes,
        origOpenProject = IDE_Morph.prototype.openProject,
        origRefreshIDE = IDE_Morph.prototype.refreshIDE,
        origNewProject = IDE_Morph.prototype.newProject,
        origProjectSettingsMenu = IDE_Morph.prototype.projectSettingsMenu,
        origAccessibleRegions = IDE_Morph.prototype.accessibleRegions;

    IDE_Morph.prototype.buildPanes = function () {
        origBuildPanes.call(this);
        this.createExecutionLog();
    };

    IDE_Morph.prototype.fixLayout = function (situation) {
        origFixLayout.call(this, situation);
        this.fixExecutionLogLayout(situation);
    };

    IDE_Morph.prototype.hideSpritePanes = function (choice = true) {
        // turning "Blocks only" off also turns the execution log off,
        // as the log lives where the stage and sprite panes would be
        if (choice !== true && this.scene) {
            this.scene.executionLog = false;
        }
        origHideSpritePanes.call(this, choice);
    };

    IDE_Morph.prototype.refreshIDE = function () {
        // the IDE is rebuilt but the project stays, keep the log
        this.keepExecutionLogOnOpen = true;
        origRefreshIDE.call(this);
    };

    IDE_Morph.prototype.newProject = function () {
        this.executionLogDefaultsPending = ExecutionLog.enabledByDefault;
        origNewProject.call(this);
    };

    IDE_Morph.prototype.openProject = function (project, purge) {
        // a new project is a new notebook
        if (!this.keepExecutionLogOnOpen && !this.isAddingScenes) {
            this.clearExecutionLog();
        }
        this.keepExecutionLogOnOpen = false;
        origOpenProject.call(this, project, purge);
        if (this.executionLogDefaultsPending) {
            this.executionLogDefaultsPending = false;
            if (!this.isAddingScenes && !this.scene.executionLog) {
                this.toggleExecutionLog(true);
            }
        }
    };

    IDE_Morph.prototype.projectSettingsMenu = function () {
        // add the "Execution Log" preference right below "Blocks only"
        var menu = origProjectSettingsMenu.call(this),
            size = MorphicPreferences.menuFontSize * 0.75,
            label = localize('Blocks only'),
            idx,
            item;

        if (this.performerMode) {
            return menu;
        }
        idx = menu.items.findIndex(each =>
            Array.isArray(each[0]) && isString(each[0][1]) &&
                each[0][1].trim() === label
        );
        item = [
            [
                new SymbolMorph(
                    this.scene.executionLog ? 'checkedBox' : 'rectangle',
                    size
                ),
                '  ' + localize('Execution Log')
            ],
            () => this.toggleExecutionLog(),
            this.scene.executionLog ?
                'uncheck to hide the\nexecution log pane'
                : 'check to log every script\nyou run and its result in\n' +
                    'a notebook-style pane\n(turns on "Blocks only")',
            null,
            false,
            false
        ];
        if (idx < 0) {
            menu.items.push(item);
        } else {
            menu.items.splice(idx + 1, 0, item);
        }
        return menu;
    };

    if (origAccessibleRegions) {
        IDE_Morph.prototype.accessibleRegions = function () {
            var regions = origAccessibleRegions.call(this),
                idx = regions.findIndex(pane => pane[0] === this.spriteEditor);
            if (this.executionLog) {
                regions.splice(
                    idx < 0 ? regions.length : idx + 1,
                    0,
                    [this.executionLog, 'Execution Log']
                );
            }
            return regions;
        };
    }
}());

// ThreadManager / Process - recording runs and their results ///////////////

(function () {
    var origStartProcess = ThreadManager.prototype.startProcess,
        origRemoveTerminated =
            ThreadManager.prototype.removeTerminatedProcesses,
        origToggleProcess = ThreadManager.prototype.toggleProcess,
        origStopProcess = ThreadManager.prototype.stopProcess,
        origStopAll = ThreadManager.prototype.stopAll,
        origThrowError = Process.prototype.throwError;

    function markStopped(process) {
        var entry = process && process.executionLogEntry;
        if (entry && entry.state === 'running') {
            entry.wasStopped = true;
        }
    }

    function ideFor(block, receiver) {
        var ide = receiver && receiver.parentThatIsA ?
            receiver.parentThatIsA(IDE_Morph) : null;
        if (!ide && block && block.parentThatIsA) {
            ide = block.parentThatIsA(IDE_Morph);
        }
        return ide;
    }

    ThreadManager.prototype.startProcess = function (
        block,
        receiver,
        isThreadSafe,
        exportResult,
        callback,
        isClicked
    ) {
        var top = block ? block.topBlock() : null,
            active = top ? this.findProcess(top, receiver) : null,
            proc,
            ide;

        if (active && !isThreadSafe) {
            markStopped(active); // it's about to be restarted
        }
        proc = origStartProcess.apply(this, arguments);
        if (proc && isClicked && !proc.executionLogEntry && top) {
            ide = ideFor(top, receiver);
            if (ide && ide.isExecutionLogActive()) {
                ide.logExecution(proc, top, receiver);
            }
        }
        return proc;
    };

    ThreadManager.prototype.removeTerminatedProcesses = function () {
        this.processes.forEach(proc => {
            var entry = proc.executionLogEntry,
                ide;
            if (entry && entry.state === 'running' &&
                    ((!proc.isRunning() && !proc.errorFlag) || proc.isDead)) {
                try {
                    entry.finish(proc);
                    ide = ideFor(proc.topBlock, proc.receiver);
                    if (ide) {
                        ide.executionLogEntryChanged(entry);
                    }
                } catch (err) {
                    // never break the scheduler over the log
                }
            }
        });
        return origRemoveTerminated.call(this);
    };

    ThreadManager.prototype.toggleProcess = function (block, receiver) {
        if (!this.disableClickToRun) {
            markStopped(this.findProcess(block, receiver));
        }
        return origToggleProcess.call(this, block, receiver);
    };

    ThreadManager.prototype.stopProcess = function (block, receiver) {
        markStopped(this.findProcess(block, receiver));
        return origStopProcess.call(this, block, receiver);
    };

    ThreadManager.prototype.stopAll = function (excpt) {
        this.processes.forEach(proc => {
            if (proc !== excpt) {
                markStopped(proc);
            }
        });
        return origStopAll.call(this, excpt);
    };

    Process.prototype.throwError = function (error, element) {
        var entry = this.executionLogEntry,
            ide;
        if (entry && entry.state === 'running') {
            try {
                entry.fail(error, element);
                ide = ideFor(this.topBlock, this.receiver);
                if (ide) {
                    ide.executionLogEntryChanged(entry);
                }
            } catch (err) {
                // never break error reporting over the log
            }
        }
        return origThrowError.call(this, error, element);
    };

    // the default error handler is a reference to throwError, re-point it
    Process.prototype.resetErrorHandling();
}());

// Scene / SnapSerializer - saving the setting with the project ////////////

Scene.prototype.executionLog = false;

(function () {
    var origLoadScene = SnapSerializer.prototype.loadScene,
        origSceneToXML = Scene.prototype.toXML;

    SnapSerializer.prototype.loadScene = function (xmlNode) {
        var scene = origLoadScene.apply(this, arguments);
        scene.executionLog = xmlNode.attributes.executionlog === 'true' &&
            scene.hideSprites;
        return scene;
    };

    Scene.prototype.toXML = function (serializer) {
        var xml = origSceneToXML.call(this, serializer);
        if (this.executionLog && this.hideSprites) {
            xml = xml.replace('<scene ', '<scene executionlog="true" ');
        }
        return xml;
    };
}());

// SnapExtensions - primitives for scripts //////////////////////////////////

(function () {
    function ideOf(obj) {
        return obj && obj.parentThatIsA ? obj.parentThatIsA(IDE_Morph) : null;
    }

    function entryAt(ide, n) {
        return ide ? detect(
            ide.executionLogEntries(),
            each => each.index === +n
        ) : null;
    }

    SnapExtensions.primitives.set(
        'log_clear()',
        function () {
            var ide = ideOf(this);
            if (ide) {
                ide.clearExecutionLog();
            }
        }
    );

    SnapExtensions.primitives.set(
        'log_count()',
        function () {
            var ide = ideOf(this);
            return ide ? ide.executionLogEntries().length : 0;
        }
    );

    SnapExtensions.primitives.set(
        'log_result(n)',
        function (n) {
            var entry = entryAt(ideOf(this), n);
            return entry && entry.hasResult ? entry.result : '';
        }
    );

    SnapExtensions.primitives.set(
        'log_script(n)',
        function (n) {
            var entry = entryAt(ideOf(this), n);
            return entry ? entry.scriptCopy().reify() : '';
        }
    );
}());
