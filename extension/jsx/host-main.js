var VersionUpdater = (function () {
    var imageExtensions = /\.(exr|dpx|cin|png|jpe?g|tiff?|tga|bmp|iff|sgi|rla|rpf)$/i;
    function filename(file) { return File.decode(file.name); }
    function palette() {
        var defaults = ["None", "Red", "Yellow", "Aqua", "Pink", "Lavender", "Peach", "Sea Foam", "Blue", "Green", "Purple", "Orange", "Brown", "Fuchsia", "Cyan", "Sandstone", "Dark Green"], labels = [];
        for (var i = 0; i <= 16; i++) {
            var name = defaults[i];
            if (i > 0) try { name = app.preferences.getPrefAsString("Label Preference Text Section 7", "Label Text ID 2 # " + i, PREFType.PREF_Type_MACHINE_INDEPENDENT) || name; } catch (_preference) {}
            labels.push({id: i, name: name});
        }
        return labels;
    }
    function applyLabel(object, options, warnings) {
        var choice = options.label === undefined ? "auto" : String(options.label);
        if (choice === "keep") return;
        try {
            var color = choice === "auto" ? (object.label === 9 ? 10 : 9) : Number(choice);
            if (color < 0 || color > 16 || isNaN(color) || color !== Math.floor(color)) throw new Error("Invalid label color");
            object.label = color;
        } catch (error) { warnings.push("Could not change label for " + object.name + ": " + error.toString()); }
    }
    function labelSourceLayers(source, options, warnings) {
        if (options.label === "keep") return;
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (!(comp instanceof CompItem)) continue;
            for (var l = 1; l <= comp.numLayers; l++) {
                var layer = comp.layer(l);
                if (!layer.source || layer.source.id !== source.id) continue;
                var locked = layer.locked;
                try { layer.locked = false; applyLabel(layer, options, warnings); }
                finally { layer.locked = locked; }
            }
        }
    }
    function collect(mode) {
        if (!app.project) throw new Error("Open a project first.");
        var items = [], seen = {}, selected, i, item, comps = [];
        var comp = app.project.activeItem;
        var useTimeline = mode === "timeline" || (mode === "auto" && comp instanceof CompItem && comp.selectedLayers.length > 0);
        if (useTimeline) {
            if (!(comp instanceof CompItem)) throw new Error("Open a composition and select timeline layers.");
            selected = comp.selectedLayers;
        } else selected = app.project.selection;
        function add(source) {
            if (!source || seen[source.id]) return;
            seen[source.id] = true; items.push(source);
        }
        for (i = 0; i < selected.length; i++) {
            item = useTimeline ? selected[i].source : selected[i];
            if (!useTimeline && item instanceof CompItem) {
                comps.push(item);
                for (var l = 1; l <= item.numLayers; l++) if (!(item.layer(l).source instanceof CompItem)) add(item.layer(l).source);
            } else add(item);
        }
        return {items: items, comps: comps, timeline: useTimeline};
    }
    function statistics(cache) {
        if (!cache.stats) cache.stats = {directoryQueries: 0, cacheHits: 0, entriesReturned: 0, queries: []};
        return cache.stats;
    }
    function listing(folder, cache, mask) {
        mask = mask || "*";
        var key = "$" + folder.fsName + "|" + mask, stats = statistics(cache);
        if (cache[key]) { stats.cacheHits++; return cache[key]; }
        var value = {files: [], names: [], paths: {}, folders: []};
        if (folder.exists) {
            var entries = folder.getFiles(mask);
            stats.directoryQueries++; stats.entriesReturned += entries.length;
            stats.queries.push({folder: folder.fsName, mask: mask, count: entries.length});
            for (var i = 0; i < entries.length; i++) {
                if (entries[i] instanceof File) {
                    var name = filename(entries[i]);
                    value.files.push(entries[i]); value.names.push(name); value.paths[name] = entries[i].fsName;
                } else if (entries[i] instanceof Folder) value.folders.push(entries[i]);
            }
        }
        cache[key] = value; return value;
    }
    function renderContext(file) {
        var folder = file.parent, tail = [];
        // Only examine ancestors and the siblings of the nearest revision folder.
        for (var depth = 0; folder && depth < 8; depth++) {
            var name = File.decode(folder.name), rev = VersionUpdaterCore.revision(name);
            if (rev) return {folder: folder, revision: rev, tail: tail};
            if (/^renders$/i.test(name) || !folder.parent || folder.parent.fsName === folder.fsName) break;
            tail.unshift(name); folder = folder.parent;
        }
        return null;
    }
    function compatibleVersions(file, sequence, context, revisions, cache) {
        var current = VersionUpdaterCore.renderFile(filename(file), sequence), versions = [], seen = {};
        if (!current) return [context.revision.version];
        var frameMatch = sequence ? /[._ -](\d+)\.[^.]+$/.exec(filename(file)) : null;
        var broadMask = VersionUpdaterCore.glob(filename(file), sequence, true);
        function matches(files, version) {
            for (var k = 0; k < files.length; k++) {
                var parsed = VersionUpdaterCore.renderFile(filename(files[k]), sequence);
                if (parsed && parsed.key === current.key && (parsed.version === null || parsed.version === version)) return true;
            }
            return false;
        }
        for (var i = 0; i < revisions.length; i++) {
            var revision = revisions[i], version = revision.version;
            if (seen["$" + version]) continue;
            if (version === context.revision.version) { seen["$" + version] = true; versions.push(version); continue; }
            var folder = revision.folder;
            for (var j = 0; j < context.tail.length; j++) folder = new Folder(folder.fsName + "/" + context.tail[j]);
            var mask = VersionUpdaterCore.glob(filename(file), sequence, true, revision.digits);
            var cached = cache["$" + folder.fsName + "|" + mask], files;
            if (cached) files = cached.files;
            else {
                var probe = VersionUpdaterCore.glob(filename(file), sequence, true, revision.digits, frameMatch ? frameMatch[1] : undefined);
                files = listing(folder, cache, probe).files;
                if (!matches(files, version)) files = listing(folder, cache, mask).files;
            }
            if (!files.length && mask !== broadMask) files = listing(folder, cache, broadMask).files;
            if (matches(files, version)) { seen["$" + version] = true; versions.push(version); }
        }
        if (!seen["$" + context.revision.version]) versions.push(context.revision.version);
        versions.sort(function (a, b) { return b - a; });
        return versions;
    }
    function findLatest(file, sequence, cache, requestedVersion, includeCatalog) {
        var context = renderContext(file), decision, i, j, choices = [], seenVersions = {};
        var explicit = requestedVersion !== undefined && requestedVersion !== null;
        if (context) {
            var folderMask = context.revision.key.replace(/\{r\}/g, "r*");
            var folders = listing(context.folder.parent, cache, folderMask).folders, revisions = [];
            for (i = 0; i < folders.length; i++) {
                var revision = VersionUpdaterCore.revision(File.decode(folders[i].name));
                if (!revision || revision.key !== context.revision.key) continue;
                revisions.push({folder: folders[i], version: revision.version, digits: revision.digits});
                if (!seenVersions["$" + revision.version]) { seenVersions["$" + revision.version] = true; choices.push(revision.version); }
            }
            if (!seenVersions["$" + context.revision.version]) choices.push(context.revision.version);
            choices.sort(function (a, b) { return b - a; });
            revisions.sort(function (a, b) { return b.version - a.version; });
            var mask = VersionUpdaterCore.glob(filename(file), sequence, true), position = 0;
            // Discover all revision NAMES, but inspect frames only at the first matching revision.
            while (position < revisions.length) {
                var version = revisions[position].version, group = [], candidates = [];
                while (position < revisions.length && revisions[position].version === version) group.push(revisions[position++]);
                if (explicit ? version !== requestedVersion : version <= context.revision.version) continue;
                for (var g = 0; g < group.length; g++) {
                    var candidateFolder = group[g].folder;
                    for (j = 0; j < context.tail.length; j++) candidateFolder = new Folder(candidateFolder.fsName + "/" + context.tail[j]);
                    var preciseMask = VersionUpdaterCore.glob(filename(file), sequence, true, group[g].digits);
                    var files = listing(candidateFolder, cache, preciseMask).files;
                    // A producer may pad the filename revision differently from the folder.
                    if (!files.length && preciseMask !== mask) files = listing(candidateFolder, cache, mask).files;
                    for (j = 0; j < files.length; j++) candidates.push({name: filename(files[j]), path: files[j].fsName, folder: candidateFolder.fsName, version: version});
                }
                var attempt = VersionUpdaterCore.chooseRender(filename(file), candidates, sequence, context.revision.version, requestedVersion);
                if (explicit || attempt.status !== "current") { decision = attempt; break; }
            }
            if (!decision) decision = VersionUpdaterCore.chooseRender(filename(file), [], sequence, context.revision.version, requestedVersion);
            decision.token = "r";
            decision.versions = includeCatalog === false ? choices : compatibleVersions(file, sequence, context, revisions, cache);
            decision.currentVersion = context.revision.version;
            decision.search = "Sibling render revisions";
            decision.revisionFolder = context.folder.fsName;
            if (sequence && decision.status === "update") {
                var original = VersionUpdaterCore.renderFile(filename(file), true), originalRevision = VersionUpdaterCore.revision(filename(file));
                var oldFiles = listing(file.parent, cache, VersionUpdaterCore.glob(filename(file), true, true, originalRevision ? originalRevision.digits : undefined)).names;
                var count = 0, first = null, last = null;
                for (i = 0; i < oldFiles.length; i++) {
                    var frame = VersionUpdaterCore.renderFile(oldFiles[i], true);
                    if (frame && frame.key === original.key && frame.version === original.version) {
                        count++; first = first === null ? frame.frame : Math.min(first, frame.frame); last = last === null ? frame.frame : Math.max(last, frame.frame);
                    }
                }
                var warnings = [];
                if (decision.warning) warnings.push(decision.warning);
                if (count && decision.frameCount < count) warnings.push("New sequence has fewer frames than the original (" + decision.frameCount + " vs " + count + ")");
                if (first !== null && (first !== decision.firstFrame || last !== decision.lastFrame)) warnings.push("Frame range changes from " + first + "–" + last + " to " + decision.firstFrame + "–" + decision.lastFrame);
                decision.warning = warnings.join(". ");
            }
            return decision;
        }
        if (!file.parent.exists) return {status: "skipped", reason: "Source folder is unavailable"};
        var local = listing(file.parent, cache, VersionUpdaterCore.glob(filename(file), sequence, false));
        var current = VersionUpdaterCore.parse(filename(file), sequence);
        if (current) {
            choices.push(current.version); seenVersions["$" + current.version] = true;
            for (i = 0; i < local.names.length; i++) {
                var parsed = VersionUpdaterCore.parse(local.names[i], sequence);
                if (parsed && parsed.key === current.key && !seenVersions["$" + parsed.version]) { choices.push(parsed.version); seenVersions["$" + parsed.version] = true; }
            }
        }
        choices.sort(function (a, b) { return b - a; });
        decision = VersionUpdaterCore.choose(filename(file), local.names, sequence, requestedVersion);
        if (current) decision.token = current.token;
        if (sequence && current && decision.status === "update") {
            var oldCount = 0, oldFirst = null, oldLast = null, notices = [];
            for (i = 0; i < local.names.length; i++) {
                var oldFrame = VersionUpdaterCore.parse(local.names[i], true);
                if (oldFrame && oldFrame.key === current.key && oldFrame.version === current.version) {
                    oldCount++; oldFirst = oldFirst === null ? oldFrame.frame : Math.min(oldFirst, oldFrame.frame); oldLast = oldLast === null ? oldFrame.frame : Math.max(oldLast, oldFrame.frame);
                }
            }
            if (decision.warning) notices.push(decision.warning);
            if (oldCount && decision.frameCount < oldCount) notices.push("Selected sequence has fewer frames than the original");
            if (oldFirst !== null && (oldFirst !== decision.firstFrame || oldLast !== decision.lastFrame)) notices.push("Frame range changes from " + oldFirst + "–" + oldLast + " to " + decision.firstFrame + "–" + decision.lastFrame);
            decision.warning = notices.join(". ");
        }
        if (decision.status === "update") decision.path = local.paths[decision.name];
        decision.versions = choices; decision.currentVersion = current ? current.version : null;
        decision.search = "Source folder"; return decision;
    }
    function decorateRow(row, decision, requestedVersion) {
        row.status = decision.status; row.reason = decision.reason || "Version selected";
        row.search = decision.search; row.token = decision.token || "v";
        row.versionChoices = decision.versions || []; row.currentVersion = decision.currentVersion;
        row.requestedVersion = requestedVersion === undefined ? null : requestedVersion;
        if (row.requestedVersion === null) row.latestVersion = decision.to || decision.currentVersion;
        delete row.target; delete row.frames; row.warning = "";
        if (decision.status === "update") {
            row.target = decision.path; row.from = decision.from; row.to = decision.to;
            row.warning = decision.warning || "";
            if (decision.frameCount) row.frames = {count: decision.frameCount, first: decision.firstFrame, last: decision.lastFrame};
        }
        return row;
    }
    function plan(mode, folderCache) {
        var selection = collect(mode), items = selection.items, rows = [], i, item, file, sequence, decision;
        for (i = 0; i < items.length; i++) {
            item = items[i];
            var row = {itemId: item.id, item: item.name, status: "skipped"};
            rows.push(row);
            try {
                if (!(item instanceof FootageItem) || !(item.mainSource instanceof FileSource)) {
                    row.reason = "Select file footage (compositions, solids and generated sources are skipped)"; continue;
                }
                file = item.file;
                if (!file) { row.reason = "No source path"; continue; }
                row.source = file.fsName;
                sequence = imageExtensions.test(filename(file)) && !item.mainSource.isStill;
                row.sequence = sequence;
                decision = findLatest(file, sequence, folderCache);
                decorateRow(row, decision, null);
            } catch (error) { row.status = "error"; row.reason = error.toString(); }
        }
        return {rows: rows, selection: selection};
    }
    function scan(mode) {
        try {
            var cache = {}, planned = plan(mode, cache), rows = planned.rows, comp = app.project.activeItem;
            var comps = planned.selection.comps, context = {compId: null, compName: "", mode: mode, comps: []};
            if (!comps.length && comp instanceof CompItem) comps = [comp];
            for (var ci = 0; ci < comps.length; ci++) {
                comp = comps[ci];
                context.comps.push({id: comp.id, name: comp.name});
                if (ci === 0) { context.compId = comp.id; context.compName = comp.name; }
                var timeline = planned.selection.timeline;
                var layers = [], i, j;
                if (timeline) layers = comp.selectedLayers;
                else for (i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
                for (i = 0; i < rows.length; i++) {
                    if (!rows[i].targets) { rows[i].targets = []; rows[i].layerIds = []; }
                    for (j = 0; j < layers.length; j++) {
                        if (layers[j].source && layers[j].source.id === rows[i].itemId) {
                            rows[i].layerIds.push(layers[j].id);
                            rows[i].targets.push({compId: comp.id, layerId: layers[j].id});
                        }
                    }
                }
            }
            return JSON.stringify({ok: true, rows: rows, context: context, labels: palette(), performance: statistics(cache)});
        }
        catch (error) { return JSON.stringify({ok: false, error: error.toString()}); }
    }
    function validate(row, cache) {
        var item = app.project.itemByID(row.itemId);
        if (!(item instanceof FootageItem) || !item.file || item.file.fsName !== row.source) throw new Error("Source changed since preview. Scan again.");
        if ((imageExtensions.test(filename(item.file)) && !item.mainSource.isStill) !== row.sequence) throw new Error("Source import mode changed between still and sequence. Scan again.");
        var target = new File(row.target);
        if (!target.exists) throw new Error("Target is missing. Scan again.");
        var decision = findLatest(item.file, row.sequence, cache || {}, row.requestedVersion, false);
        if (decision.status !== "update" || new File(decision.path).fsName !== target.fsName || (decision.warning || "") !== (row.warning || "")) throw new Error("Folder contents changed. Scan again.");
        return {item: item, target: target, row: row, layers: []};
    }
    function sequenceBin(entry, bins) {
        var context = renderContext(entry.target);
        var name = VersionUpdaterCore.sequenceBinName(filename(entry.target), entry.row.to, context ? File.decode(context.folder.name) : "");
        var parent = entry.item.parentFolder;
        // A previous generated version folder should gain a sibling, not nested revisions.
        var oldName = name.replace(/_\d+$/, "_" + entry.row.from);
        if (parent.name.toLowerCase() === oldName.toLowerCase() && parent.parentFolder && parent.id !== app.project.rootFolder.id) parent = parent.parentFolder;
        var key = "$" + parent.id + "|" + name.toLowerCase();
        if (bins[key]) return bins[key];
        for (var i = 1; i <= parent.numItems; i++) {
            var existing = parent.item(i);
            if (existing instanceof FolderItem && existing.name.toLowerCase() === name.toLowerCase()) { bins[key] = existing; return existing; }
        }
        var folder = app.project.items.addFolder(name); folder.parentFolder = parent;
        bins[key] = folder; bins.created.push(folder); return folder;
    }
    function importVersion(entry, warnings, bins) {
        var options = new ImportOptions(entry.target);
        options.importAs = ImportAsType.FOOTAGE;
        if (entry.row.sequence) { options.sequence = true; options.forceAlphabetical = false; }
        var fresh = app.project.importFile(options);
        try { fresh.parentFolder = entry.row.sequence && bins ? sequenceBin(entry, bins) : entry.item.parentFolder; }
        catch (error) { fresh.remove(); throw error; }
        fresh.label = entry.item.label;
        var props = ["alphaMode", "premulColor", "invertAlpha", "fieldSeparationType", "highQualityFieldSeparation", "removePulldown", "conformFrameRate", "loop"];
        for (var p = 0; p < props.length; p++) {
            try {
                var value = entry.item.mainSource[props[p]];
                if (typeof value !== "undefined" && String(fresh.mainSource[props[p]]) !== String(value)) fresh.mainSource[props[p]] = value;
            } catch (error) { warnings.push("Could not copy " + props[p] + " for " + entry.row.item + ": " + error.toString()); }
        }
        return fresh;
    }
    function uniqueCompName(base) {
        var name = base, suffix = 2, found, i;
        do {
            found = false;
            for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).name === name) { found = true; break; }
            if (found) name = base + " " + suffix++;
        } while (found);
        return name;
    }
    function apply(json) {
        var rows, results = [], updated = 0, layersUpdated = 0, i, row, options, context, comp = null, duplicate = null, warnings = [], duplicates = [], bins = {created: []};
        try {
            var request = JSON.parse(json);
            rows = request instanceof Array ? request : request.rows;
            options = request.options || {}; context = request.context || {};
            var action = options.action || "replace", local = action === "comp" || action === "add" || (action === "replace" && options.duplicateComp === true);
            if (action !== "replace" && action !== "add" && action !== "import" && action !== "comp") throw new Error("Unsupported update mode.");
            if (action === "import" && options.duplicateComp === true) throw new Error("Project-bin-only mode does not create a duplicate composition.");
            if (local) {
                if (!context.compId) throw new Error("Scan with your target composition open before using layer or duplicate-comp mode.");
                comp = app.project.itemByID(context.compId);
                if (!(comp instanceof CompItem)) throw new Error("Scan with your target composition open before using layer or duplicate-comp mode.");
            }
            var entries = [], validationCache = {};
            for (i = 0; i < rows.length; i++) {
                row = rows[i];
                if (row.status !== "update" || row.checked === false) continue;
                try {
                    var entry = validate(row, validationCache);
                    if (local) {
                        var ids = row.layerIds || [], targets = row.targets || [], j, k;
                        if (!targets.length) for (j = 0; j < ids.length; j++) targets.push({compId: context.compId, layerId: ids[j]});
                        for (j = 0; j < targets.length; j++) {
                            var allowed = targets[j].compId === context.compId;
                            for (var ac = 0; ac < (context.comps || []).length; ac++) if (context.comps[ac].id === targets[j].compId) allowed = true;
                            if (!allowed) throw new Error("Composition scope changed. Scan again.");
                            var targetComp = app.project.itemByID(targets[j].compId);
                            if (!(targetComp instanceof CompItem)) throw new Error("Composition removed. Scan again.");
                            var matched = null;
                            for (k = 1; k <= targetComp.numLayers; k++) if (targetComp.layer(k).id === targets[j].layerId) { matched = targetComp.layer(k); break; }
                            if (!matched || !matched.source || matched.source.id !== entry.item.id) throw new Error("Timeline changed since preview. Scan again.");
                            entry.layers.push({original: matched, index: matched.index, comp: targetComp});
                        }
                        if (!entry.layers.length) throw new Error("This footage has no targeted layers in the scanned composition.");
                    }
                    entries.push(entry);
                } catch (error) { results.push({item: row.item, status: "error", reason: error.toString()}); }
            }
            if (!entries.length) return JSON.stringify({ok: true, updated: 0, layersUpdated: 0, results: results, warnings: warnings});
            app.beginUndoGroup("Update selected footage versions");
            try {
                if (options.duplicateComp === true) {
                    var duplicateMap = {};
                    for (i = 0; i < entries.length; i++) for (var dl = 0; dl < entries[i].layers.length; dl++) {
                        var sourceComp = entries[i].layers[dl].comp, compKey = "$" + sourceComp.id;
                        if (!duplicateMap[compKey]) {
                            var duplicateName = uniqueCompName(options.compName || sourceComp.name + " - updated");
                            duplicate = sourceComp.duplicate(); duplicate.name = duplicateName;
                            duplicateMap[compKey] = duplicate; duplicates.push(duplicate);
                        }
                    }
                    // Capture every layer object before additions can shift any layer indexes.
                    for (i = 0; i < entries.length; i++) for (var d = 0; d < entries[i].layers.length; d++) entries[i].layers[d].target = duplicateMap["$" + entries[i].layers[d].comp.id].layer(entries[i].layers[d].index);
                }
                for (i = 0; i < entries.length; i++) {
                    var current = entries[i], fresh = null, created = [], changed = [], rowLayerCount = 0;
                    row = current.row;
                    try {
                        if (action === "import") {
                            fresh = importVersion(current, warnings, bins);
                            applyLabel(fresh, options, warnings);
                        } else if (!local) {
                            if (row.sequence) current.item.replaceWithSequence(current.target, false);
                            else current.item.replace(current.target);
                            applyLabel(current.item, options, warnings);
                            labelSourceLayers(current.item, options, warnings);
                        } else {
                            fresh = importVersion(current, warnings, bins);
                            applyLabel(fresh, options, warnings);
                            for (var l = 0; l < current.layers.length; l++) {
                                var original = duplicate ? current.layers[l].target : current.layers[l].original;
                                var locked = original.locked;
                                try {
                                    original.locked = false;
                                    if (action === "add") {
                                        var added = original.duplicate(); created.push(added);
                                        added.locked = false; added.replaceSource(fresh, false); added.moveBefore(original);
                                        added.name = fresh.name; applyLabel(added, options, warnings); added.locked = locked;
                                    } else { changed.push({layer: original, label: original.label}); original.replaceSource(fresh, false); applyLabel(original, options, warnings); }
                                    rowLayerCount++;
                                } finally { original.locked = locked; }
                            }
                        }
                        updated++; layersUpdated += rowLayerCount;
                        results.push({item: row.item, status: "updated", target: current.target.fsName, importedItemId: fresh ? fresh.id : null, binFolder: fresh ? fresh.parentFolder.name : null, reason: action === "import" ? "Imported into Project bin; existing sources and layers unchanged" : local ? rowLayerCount + " layer(s) " + (action === "add" ? "added above originals" : "updated in " + (duplicate ? "duplicate" : "scanned composition(s)")) : "Source replaced throughout project"});
                    } catch (error) {
                        // Roll back this row's new layers/source changes, retaining successful other rows.
                        for (var c = created.length - 1; c >= 0; c--) try { created[c].locked = false; created[c].remove(); } catch (_cleanupLayer) {}
                        for (var r = 0; r < changed.length; r++) try {
                            var restoredLayer = changed[r].layer, wasLocked = restoredLayer.locked; restoredLayer.locked = false;
                            restoredLayer.replaceSource(current.item, false); restoredLayer.label = changed[r].label; restoredLayer.locked = wasLocked;
                        } catch (_restoreSource) {}
                        if (fresh) try { fresh.remove(); } catch (_cleanupFootage) {}
                        results.push({item: row.item, status: "error", reason: error.toString()});
                    }
                }
                if (updated === 0) { for (i = 0; i < duplicates.length; i++) duplicates[i].remove(); duplicate = null; duplicates = []; }
                for (i = bins.created.length - 1; i >= 0; i--) if (bins.created[i].numItems === 0) bins.created[i].remove();
                if (duplicate) duplicate.openInViewer();
            } finally { app.endUndoGroup(); }
            var duplicateInfo = []; for (i = 0; i < duplicates.length; i++) duplicateInfo.push({id: duplicates[i].id, name: duplicates[i].name});
            return JSON.stringify({ok: true, updated: updated, imported: action === "import" ? updated : 0, layersUpdated: layersUpdated, results: results, warnings: warnings, duplicateComps: duplicateInfo, duplicateComp: duplicate ? {id: duplicate.id, name: duplicate.name} : null});
        } catch (error) { return JSON.stringify({ok: false, error: error.toString()}); }
    }
    function inspectSource(path, sequence) {
        try { var cache = {}; var decision = findLatest(new File(path), sequence === true, cache); return JSON.stringify({ok: true, decision: decision, performance: statistics(cache)}); }
        catch (error) { return JSON.stringify({ok: false, error: error.toString()}); }
    }
    function resolveVersion(json) {
        try {
            var request = JSON.parse(json), row = request.row, item = app.project.itemByID(row.itemId), cache = {};
            if (!(item instanceof FootageItem) || !item.file || item.file.fsName !== row.source) throw new Error("Source changed. Scan again.");
            if ((imageExtensions.test(filename(item.file)) && !item.mainSource.isStill) !== row.sequence) throw new Error("Source import mode changed. Scan again.");
            var version = request.version === null ? null : Number(request.version);
            if (version !== null && (isNaN(version) || version < 0 || version !== Math.floor(version))) throw new Error("Invalid version");
            var decision = findLatest(item.file, row.sequence, cache, version, false);
            decision.versions = row.versionChoices || [];
            return JSON.stringify({ok: true, row: decorateRow(row, decision, version), performance: statistics(cache)});
        } catch (error) { return JSON.stringify({ok: false, error: error.toString()}); }
    }
    return {scan: scan, apply: apply, inspectSource: inspectSource, resolveVersion: resolveVersion};
}());
$.global.VersionUpdater = VersionUpdater;
