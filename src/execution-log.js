/*global SnapExtensions, IDE_Morph, Scene, Process, ThreadManager, BlockMorph,
    ReporterBlockMorph, Costume, SVG_Costume, Sound, List, Context,
    StageMorph, Point, localize */

// Default-loaded IDE extension. All interpreter hooks delegate to Snap!'s
// original methods; removing this file restores the standard IDE.
(function () {
    'use strict';

    if (SnapExtensions.executionLog) { return; }

    function wrap(object, name, extension) {
        var original = object[name];
        object[name] = function () {
            return extension.call(this, original, Array.from(arguments));
        };
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    function button(label, action) {
        var node = element('button', '', localize(label));
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }

    function snapshot(value, ide) {
        // Store exportable data now: a later mutation must not rewrite history.
        var image, text;
        if (value instanceof SVG_Costume) {
            return {type: 'text/svg', data: value.contents.src, image: true};
        }
        if (value instanceof Costume) {
            return {type: 'image/png', data: value.contents.toDataURL(), image: true};
        }
        if (value instanceof Sound) {
            return {type: 'audio/wav', data: value.audio.src, audio: true};
        }
        if (value instanceof HTMLCanvasElement) {
            return {type: 'image/png', data: value.toDataURL(), image: true};
        }
        if (value instanceof List) {
            try {
                text = value.asJSON();
            } catch (err) {
                text = value.asText();
                return {type: 'text/plain', data: text};
            }
            return {type: 'application/json', data: text};
        }
        if (value instanceof Context) {
            return {type: 'text/xml', data: ide.serializer.serialize(value),
                text: value.toString()};
        }
        if (value && typeof value.fullImage === 'function') {
            image = value.fullImage();
            return {type: 'image/png', data: image.toDataURL(), image: true};
        }
        return {type: 'text/plain', data: String(value)};
    }

    function ExecutionLog(ide) {
        this.ide = ide;
        this.entries = [];
        this.sequence = 0;
        this.enabled = ide.getSetting('executionLog') !== 'false';
        this.root = element('aside', 'execution-log');
        this.root.setAttribute('aria-label', localize('Execution Log'));
        var header = element('header', 'execution-log-header'),
            actions = element('div', 'execution-log-actions');
        header.appendChild(element('h2', '', localize('Execution Log')));
        actions.appendChild(button('Export all scripts', () => this.exportAll()));
        actions.appendChild(button('Clear log', () => this.clear()));
        actions.appendChild(button('Hide', () => this.toggle()));
        header.appendChild(actions);
        this.root.appendChild(header);
        this.cells = element('div', 'execution-log-cells');
        this.cells.setAttribute('role', 'region');
        this.cells.setAttribute('aria-label', localize('Script executions'));
        this.empty = element('p', 'execution-log-empty',
            localize('Run a script or reporter to see its blocks and output here.'));
        this.cells.appendChild(this.empty);
        this.root.appendChild(this.cells);
        // Announce brief events, rather than reading every cell on every update.
        this.announcer = element('div', 'execution-log-announcer');
        this.announcer.setAttribute('role', 'status');
        this.root.appendChild(this.announcer);
        document.body.appendChild(this.root);
        this.root.addEventListener('dragover', event => event.preventDefault());
        this.root.addEventListener('drop', event => {
            event.preventDefault();
            event.stopPropagation();
        });
        this.root.addEventListener('keydown', event => event.stopPropagation());
        this.root.addEventListener('keyup', event => event.stopPropagation());
    }

    ExecutionLog.prototype.visible = function () {
        return this.enabled && !this.ide.isAppMode && !this.ide.isEmbedMode;
    };

    ExecutionLog.prototype.layout = function (extent) {
        var visible = this.visible(),
            stacked = extent.x < 850,
            size = stacked ? Math.round(extent.y * 0.42) :
                Math.min(440, Math.round(extent.x * 0.36));
        this.root.hidden = !visible;
        this.root.classList.toggle('execution-log-stacked', stacked);
        this.root.style.width = stacked ? '100%' : size + 'px';
        this.root.style.height = stacked ? size + 'px' : '100%';
        return !visible ? extent : stacked ?
            new Point(extent.x, extent.y - size) :
            new Point(extent.x - size, extent.y);
    };

    ExecutionLog.prototype.toggle = function () {
        this.enabled = !this.enabled;
        this.ide.saveSetting('executionLog', this.enabled);
        this.ide.setExtent(this.ide.world().extent());
    };

    ExecutionLog.prototype.clear = function () {
        // Processes holding an old entry can finish without repopulating the log.
        this.entries.forEach(entry => { entry.discarded = true; });
        this.entries = [];
        this.cells.replaceChildren(this.empty);
        this.empty.hidden = false;
        this.announcer.textContent = localize('Execution log cleared');
    };

    ExecutionLog.prototype.follow = function (change) {
        var atBottom = this.cells.scrollHeight - this.cells.scrollTop -
            this.cells.clientHeight < 48;
        change();
        if (atBottom) { this.cells.scrollTop = this.cells.scrollHeight; }
    };

    ExecutionLog.prototype.start = function (proc) {
        var block = proc.topBlock,
            receiver = proc.homeContext.receiver,
            entry = {
                number: ++this.sequence,
                outputs: [],
                status: 'Running',
                // Native script XML includes custom block dependencies.
                xml: block.toXMLString(receiver),
                script: block.fullCopy(),
                globals: block.dependencies(false, receiver)
                    .filter(def => def.isGlobal && !def.selector)
                    .map(def => ({spec: def.spec, semanticSpec: def.blockSpec()})),
                receiver: receiver.name,
                started: new Date()
            },
            cell = element('article', 'execution-log-cell'),
            title = element('div', 'execution-log-cell-title'),
            scriptButton = button('Drag or click to restore script', () =>
                this.restore(entry)),
            image = element('img'),
            actions = element('div', 'execution-log-actions');
        if (!entry.xml) { return null; }
        entry.log = this;
        entry.node = cell;
        entry.state = element('span', 'execution-log-state', localize('Running'));
        cell.setAttribute('aria-label', localize('Execution') + ' ' + entry.number);
        cell.tabIndex = 0;
        title.appendChild(element('strong', '', '[' + entry.number + '] ' + entry.receiver));
        title.appendChild(entry.state);
        cell.appendChild(title);
        image.src = entry.script.fullImage().toDataURL();
        image.alt = block.abstractBlockSpec() || block.blockSpec || localize('Script');
        image.draggable = false;
        scriptButton.replaceChildren(image);
        scriptButton.className = 'execution-log-script';
        scriptButton.setAttribute('aria-label', localize('Restore script') + ' ' + entry.number);
        scriptButton.title = localize('Drag into the scripting area, or click to restore a copy');
        scriptButton.draggable = true;
        scriptButton.addEventListener('dragstart', event => {
            this.draggedEntry = entry;
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/plain', entry.xml);
        });
        scriptButton.addEventListener('dragend', () => { this.draggedEntry = null; });
        cell.appendChild(scriptButton);
        actions.appendChild(button('Restore script', () => this.restore(entry)));
        actions.appendChild(button('Export blocks', () =>
            this.ide.saveXMLAs(entry.xml, 'execution-' + entry.number)));
        actions.appendChild(button('Export block image', () =>
            this.ide.saveCanvasAs(entry.script.fullImage(), 'execution-' + entry.number)));
        cell.appendChild(actions);
        entry.outputNode = element('div', 'execution-log-outputs');
        cell.appendChild(entry.outputNode);
        this.entries.push(entry);
        this.follow(() => {
            this.empty.hidden = true;
            this.cells.appendChild(cell);
        });
        this.announcer.textContent = localize('Execution') + ' ' + entry.number +
            ': ' + localize('Running');
        return entry;
    };

    ExecutionLog.prototype.restore = function (entry, position) {
        var ide = this.ide, script;
        ide.spriteBar.tabBar.tabTo('scripts');
        if (!position) {
            ide.rawOpenScriptString(entry.xml, true);
            ide.recordUnsavedChanges();
        } else {
            script = ide.deserializeScriptString(entry.xml);
            script.fixBlockColor(null, true);
            ide.currentSprite.scripts.add(script);
            script.setPosition(position);
            ide.currentSprite.scripts.adjustBounds();
            ide.recordUnsavedChanges();
        }
        ide.world().worldCanvas.focus();
    };

    ExecutionLog.prototype.output = function (entry, value, kind) {
        if (!entry || entry.discarded) { return; }
        var saved,
            row = element('section', 'execution-log-output'),
            preview,
            outputNumber = entry.outputs.length + 1;
        try {
            saved = snapshot(value, this.ide);
        } catch (err) {
            saved = {type: 'text/plain', data: localize('Unable to capture value') +
                ': ' + err.message};
        }
        saved.kind = kind;
        entry.outputs.push(saved);
        row.appendChild(element('div', 'execution-log-output-label', localize(kind)));
        if (saved.image) {
            preview = element('img');
            preview.src = saved.data;
            preview.alt = localize('Image output');
        } else if (saved.audio) {
            preview = element('audio');
            preview.controls = true;
            preview.src = saved.data;
        } else {
            preview = element('pre', '', saved.text || saved.data);
        }
        row.appendChild(preview);
        row.appendChild(button('Export value', () => this.ide.saveFileAs(
            saved.data, saved.type,
            'execution-' + entry.number + '-output-' + outputNumber
        )));
        this.follow(() => entry.outputNode.appendChild(row));
    };

    ExecutionLog.prototype.finish = function (entry, proc) {
        if (!entry || entry.finished || entry.discarded) { return; }
        entry.finished = true;
        entry.status = proc.errorFlag ? 'Error' : entry.stopped ? 'Stopped' : 'Completed';
        if (!proc.errorFlag && proc.homeContext.inputs.length &&
                (proc.topBlock instanceof ReporterBlockMorph || proc.isShowingResult)) {
            this.output(entry, proc.homeContext.inputs[0], 'Result');
        }
        entry.state.textContent = localize(entry.status === 'Error' ? 'Failed' : entry.status);
        entry.node.dataset.status = entry.status.toLowerCase();
        if (!entry.outputs.length) {
            entry.outputNode.appendChild(element('p', 'execution-log-no-output',
                localize('No output')));
        }
        this.announcer.textContent = localize('Execution') + ' ' + entry.number +
            ': ' + localize(entry.status);
    };

    ExecutionLog.prototype.exportAll = function () {
        if (!this.entries.length) {
            this.ide.showMessage('The execution log is empty.', 2);
            return;
        }
        // A standard Snap! sprite module: one sprite per recorded execution.
        // Local definitions stay scoped to their script. Namespace global
        // definitions per execution, so edits between runs remain reproducible.
        var doc = document.implementation.createDocument('', 'sprites'),
            root = doc.documentElement,
            globals = doc.createElement('blocks'),
            palette = doc.createElement('palette'),
            categories = new Set(),
            serial = new XMLSerializer();
        root.setAttribute('app', this.ide.serializer.app);
        root.setAttribute('version', this.ide.serializer.version);
        globals.appendChild(palette);
        root.appendChild(globals);
        this.entries.forEach(entry => {
            var source = new DOMParser().parseFromString(entry.xml, 'text/xml'),
                model = source.documentElement,
                library = Array.from(model.children).find(n => n.tagName === 'blocks'),
                script = Array.from(model.children).find(n => n.tagName === 'script'),
                sprite = doc.createElement('sprite'),
                locals = doc.createElement('blocks'),
                variables = doc.createElement('variables'),
                scripts = doc.createElement('scripts');
            entry.globals.forEach(def => {
                var suffix = ' [execution ' + entry.number + ']';
                model.querySelectorAll('blocks > block-definition').forEach(node => {
                    if (node.getAttribute('s') === def.spec) {
                        node.setAttribute('s', def.spec + suffix);
                    }
                });
                model.querySelectorAll('custom-block:not([scope])').forEach(node => {
                    if (node.getAttribute('s') === def.semanticSpec) {
                        node.setAttribute('s', def.semanticSpec + suffix);
                    }
                });
            });
            // Serializer object IDs are local to each snapshot.
            model.querySelectorAll('[id]').forEach(node => {
                node.setAttribute('id', 'log-' + entry.number + '-' + node.getAttribute('id'));
            });
            if (library) {
                Array.from(library.children).forEach(node => {
                    if (node.tagName === 'local') {
                        Array.from(node.children).forEach(child =>
                            locals.appendChild(doc.importNode(child, true)));
                    } else if (node.tagName === 'local-variables' || node.tagName === 'variables') {
                        // Each exported receiver gets its own captured data.
                        Array.from(node.children).forEach(child =>
                            variables.appendChild(doc.importNode(child, true)));
                    } else if (node.tagName === 'palette') {
                        Array.from(node.children).forEach(child => {
                            var key = child.getAttribute('name');
                            if (!categories.has(key)) {
                                palette.appendChild(doc.importNode(child, true));
                                categories.add(key);
                            }
                        });
                    } else {
                        globals.appendChild(doc.importNode(node, true));
                    }
                });
            }
            sprite.setAttribute('name', 'Execution ' + entry.number + ' - ' + entry.receiver);
            sprite.appendChild(locals);
            sprite.appendChild(variables);
            ['costumes', 'sounds'].forEach(name => {
                var media = doc.createElement(name);
                media.appendChild(doc.createElement('list'));
                sprite.appendChild(media);
            });
            scripts.appendChild(doc.importNode(script, true));
            sprite.appendChild(scripts);
            root.appendChild(sprite);
        });
        this.ide.saveXMLAs(serial.serializeToString(doc), 'execution-log-scripts');
    };

    function entryFor(proc) {
        if (proc.executionLogEntry) { return proc.executionLogEntry; }
        if (proc.executionLogUnavailable) { return null; }
        if (!(proc.topBlock instanceof BlockMorph) || proc.isSilentVar ||
                (proc.isGenericCondition && !proc.hasFiredGenericCondition)) {
            return null;
        }
        var receiver = proc.homeContext && proc.homeContext.receiver,
            ide = receiver && receiver.parentThatIsA(IDE_Morph),
            log = ide && ide.executionLog,
            stage = receiver && receiver.parentThatIsA(StageMorph);
        // Ignore internal synchronous evaluations (e.g. custom block previews).
        if (!stage || !stage.threads.processes.includes(proc)) { return null; }
        if (!log || !log.enabled) { return null; }
        try {
            proc.executionLogEntry = log.start(proc);
        } catch (err) {
            // A capture failure must never interrupt the user's program.
            proc.executionLogUnavailable = true;
            log.announcer.textContent = localize('Unable to record execution') +
                ': ' + err.message;
        }
        return proc.executionLogEntry;
    }

    SnapExtensions.executionLog = {ExecutionLog: ExecutionLog};

    wrap(IDE_Morph.prototype, 'openIn', function (original, args) {
        var result = original.apply(this, args);
        this.executionLog = new ExecutionLog(this);
        this.hideSpritePanes(this.scene.hideSprites);
        this.setExtent(this.world().extent());
        var canvas = this.world().worldCanvas;
        this.executionLogDrop = event => {
            var entry = this.executionLog.draggedEntry;
            if (!entry) { return; }
            event.preventDefault();
            event.stopImmediatePropagation();
            var rect = canvas.getBoundingClientRect(),
                position = new Point(
                    (event.clientX - rect.left) * this.world().width() / rect.width,
                    (event.clientY - rect.top) * this.world().height() / rect.height
                );
            if (this.spriteEditor.bounds.containsPoint(position)) {
                this.executionLog.restore(entry, position);
            }
            this.executionLog.draggedEntry = null;
        };
        // Capture before Morphic's normal text/file drop handler.
        canvas.addEventListener('drop', this.executionLogDrop, true);
        return result;
    });

    wrap(IDE_Morph.prototype, 'setExtent', function (original, args) {
        if (this.executionLog && this.isAutoFill) {
            args[0] = this.executionLog.layout(args[0]);
        }
        return original.apply(this, args);
    });

    wrap(IDE_Morph.prototype, 'ideSettingsMenu', function (original, args) {
        var menu = original.apply(this, args), log = this.executionLog;
        if (log) {
            menu.addPreference('Execution Log', () => log.toggle(), log.enabled,
                'uncheck to hide the execution log and stop recording',
                'check to record scripts and their output');
            var item = menu.items.pop(),
                index = menu.items.findIndex(row => Array.isArray(row[0]) &&
                    row[0][1] === localize('Blocks only'));
            menu.items.splice(index < 0 ? menu.items.length : index + 1, 0, item);
        }
        return menu;
    });

    wrap(IDE_Morph.prototype, 'destroy', function (original, args) {
        if (this.executionLog) {
            this.executionLog.root.remove();
            this.world().worldCanvas.removeEventListener('drop', this.executionLogDrop, true);
        }
        return original.apply(this, args);
    });

    wrap(IDE_Morph.prototype, 'openProject', function (original, args) {
        if (this.executionLog && !this.isAddingScenes) { this.executionLog.clear(); }
        return original.apply(this, args);
    });

    wrap(ThreadManager.prototype, 'startProcess', function (original, args) {
        var proc = original.apply(this, args);
        entryFor(proc);
        return proc;
    });

    wrap(Process.prototype, 'runStep', function (original, args) {
        entryFor(this);
        var result = original.apply(this, args), entry = entryFor(this);
        if (entry && (!this.isRunning() || this.errorFlag)) {
            entry.log.finish(entry, this);
        }
        return result;
    });

    wrap(ThreadManager.prototype, 'removeTerminatedProcesses', function (original, args) {
        this.processes.forEach(proc => {
            var entry = proc.executionLogEntry;
            if (entry && (!proc.isRunning() || proc.isDead || proc.errorFlag)) {
                entry.log.finish(entry, proc);
            }
        });
        return original.apply(this, args);
    });

    ['bubble', 'doThink', 'doSayFor', 'doThinkFor'].forEach(name => {
        wrap(Process.prototype, name, function (original, args) {
            var first = !this.context || !this.context.startTime,
                entry = entryFor(this);
            if (entry && (name === 'bubble' || name === 'doThink' || first) &&
                    !(args[0] instanceof List && args[0].isADT())) {
                entry.log.output(entry, args[0],
                    name === 'doThink' || name === 'doThinkFor' ? 'Thought' : 'Output');
            }
            return original.apply(this, args);
        });
    });

    wrap(Process.prototype, 'stop', function (original, args) {
        if (this.executionLogEntry) { this.executionLogEntry.stopped = true; }
        return original.apply(this, args);
    });

    wrap(Process.prototype, 'throwError', function (original, args) {
        var entry = entryFor(this), result = original.apply(this, args);
        if (entry) {
            entry.log.output(entry, args[0].name + ': ' + args[0].message, 'Error');
            entry.log.finish(entry, this);
        }
        return result;
    });
    // Snap caches throwError as handleError when threads.js loads.
    Process.prototype.resetErrorHandling();
}());
