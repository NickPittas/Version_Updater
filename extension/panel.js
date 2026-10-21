(function () {
    'use strict';
    var rows = [], busy = false, context = {};
    var scan = document.getElementById('scan'), update = document.getElementById('update');
    var mode = document.getElementById('mode'), status = document.getElementById('status');
    var action = document.getElementById('action'), duplicate = document.getElementById('duplicate'), compName = document.getElementById('compName');
    var selectAll = document.getElementById('selectAll'), selectNone = document.getElementById('selectNone');
    var label = document.getElementById('label');
    function populateLabels(labels) {
        var previous = label.value;
        while (label.options.length > 2) label.remove(2);
        labels.forEach(function (color) {
            var option = document.createElement('option'); option.value = String(color.id);
            option.textContent = color.name + ' (' + color.id + ')'; label.appendChild(option);
        });
        label.value = previous;
    }
    populateLabels(['None','Red','Yellow','Aqua','Pink','Lavender','Peach','Sea Foam','Blue','Green','Purple','Orange','Brown','Fuchsia','Cyan','Sandstone','Dark Green'].map(function (name, id) { return {id:id, name:name}; }));
    var transport = window.__adobe_cep__ && window.cep && window.cep.fs ?
        VersionUpdaterTransport.create(window.__adobe_cep__, window.cep.fs, window) : null;
    function selectedRows() { return rows.filter(function (r) { return r.status === 'update' && r.checked; }); }
    function refreshControls() {
        var available = rows.filter(function (r) { return r.status === 'update'; }).length;
        update.disabled = busy || !selectedRows().length;
        selectAll.disabled = selectNone.disabled = busy || !available;
        document.getElementById('count').textContent = selectedRows().length + ' of ' + available + ' updates checked';
        Array.prototype.forEach.call(document.querySelectorAll('.row input,.row select'), function (el) { el.disabled = busy; });
    }
    function setBusy(value) {
        busy = value; scan.disabled = mode.disabled = action.disabled = duplicate.disabled = compName.disabled = label.disabled = value;
        if (action.value === 'import') duplicate.disabled = true;
        refreshControls();
    }
    function refreshScope() {
        if (action.value === 'import') { duplicate.checked = false; duplicate.disabled = true; }
        else duplicate.disabled = busy;
        compName.hidden = !duplicate.checked;
        if (action.value === 'import') {
            document.getElementById('scope').textContent = 'Imports checked versions and keeps existing footage and timelines unchanged. Sequences are grouped into version subfolders, such as card_12. No composition needs to be open.';
            return;
        }
        var local = action.value === 'comp' || action.value === 'add' || duplicate.checked;
        document.getElementById('scope').textContent = action.value === 'add' ?
            'Keeps both sources in the bin. Adds an updated copy directly above each targeted layer, preserving its timing, effects and keyframes.' :
            duplicate.checked ? 'Imports new sources and updates targeted layers only in the duplicated composition. The original composition keeps its old sources.' :
            action.value === 'comp' ? 'Imports new sources and updates only targeted layers in the scanned composition(s). Original bin footage and other compositions keep their sources.' :
            'Replaces checked footage throughout the project, including every composition using it.';
        if (local) document.getElementById('scope').textContent += ' Project-bin comp selections scan all direct footage layers in those comps; otherwise the open comp is used. Timeline scans target selected layers. Nested precomps are unchanged. Imported sequences share version subfolders.';
        if (duplicate.checked && action.value === 'add') document.getElementById('scope').textContent += ' All new layers are added in the duplicate.';
    }
    function invoke(script, callback) {
        if (!transport) { callback({ok: false, error: 'Open this panel inside After Effects.'}); return; }
        transport(script, callback);
    }
    function changeVersion(row, value) {
        if (busy) return;
        setBusy(true); status.textContent = 'Resolving the selected version…';
        var request = {row: row, version: value === 'latest' ? null : Number(value)};
        invoke('VersionUpdater.resolveVersion(' + JSON.stringify(JSON.stringify(request)) + ')', function (data) {
            if (data.ok) {
                for (var i = 0; i < rows.length; i++) if (rows[i] === row) {
                    rows[i] = data.row;
                    rows[i].checked = data.row.status === 'update' && !data.row.warning;
                    break;
                }
                status.textContent = data.row.warning || (data.row.status === 'update' ? 'Selected version ready. Review and apply checked items.' : data.row.reason);
            } else status.textContent = data.error;
            render(rows); setBusy(false);
        });
    }
    function render(data) {
        var root = document.getElementById('results'); root.textContent = '';
        data.forEach(function (row) {
            var el = document.createElement('div'); el.className = 'row';
            if (row.status === 'update') {
                var check = document.createElement('input'); check.type = 'checkbox'; check.checked = row.checked;
                check.setAttribute('aria-label', 'Update ' + row.item);
                check.onchange = function () { row.checked = check.checked; refreshControls(); };
                el.appendChild(check);
            }
            var title = document.createElement('div'); title.className = 'title ' + row.status;
            title.textContent = row.item; el.appendChild(title);
            if (row.versionChoices && row.versionChoices.length > 1) {
                var versions = document.createElement('select'); versions.className = 'versions';
                versions.setAttribute('aria-label', 'Version for ' + row.item);
                var latest = document.createElement('option'); latest.value = 'latest';
                latest.textContent = 'Latest available' + (row.latestVersion !== undefined && row.latestVersion !== null ? ' (' + (row.token || 'v') + row.latestVersion + ')' : '');
                versions.appendChild(latest);
                row.versionChoices.forEach(function (version) {
                    var option = document.createElement('option'); option.value = String(version);
                    option.textContent = (row.token || 'v') + version + (version === row.currentVersion ? ' · current' : '');
                    option.disabled = version === row.currentVersion; versions.appendChild(option);
                });
                versions.value = row.requestedVersion === null || row.requestedVersion === undefined ? 'latest' : String(row.requestedVersion);
                versions.onchange = function () { changeVersion(row, versions.value); };
                el.appendChild(versions);
            }
            var detail = document.createElement('div'); detail.className = 'detail';
            var token = row.token || 'v';
            detail.textContent = row.status === 'update' ? token + row.from + ' → ' + token + row.to + (row.sequence ? ' · image sequence' : '') + ' · ' + (row.layerIds || []).length + ' targeted layer(s)' : row.reason || row.status;
            el.appendChild(detail);
            if (row.binFolder) { var bin = document.createElement('div'); bin.className = 'detail'; bin.textContent = 'Project folder: ' + row.binFolder; el.appendChild(bin); }
            if (row.target) {
                var paths = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Show target path'; paths.appendChild(summary);
                var target = document.createElement('div'); target.className = 'detail'; target.textContent = row.target; paths.appendChild(target); el.appendChild(paths);
            }
            if (row.search) { var search = document.createElement('div'); search.className = 'detail'; search.textContent = row.search + (row.frames ? ' · ' + row.frames.count + ' frames (' + row.frames.first + '–' + row.frames.last + ')' : ''); el.appendChild(search); }
            if (row.warning) { var warning = document.createElement('div'); warning.className = 'detail warning'; warning.textContent = row.warning + '. Review before checking this update.'; el.appendChild(warning); }
            root.appendChild(el);
        });
    }
    scan.onclick = function () {
        if (busy) return; rows = []; setBusy(true); status.textContent = 'Scanning source folders and sibling render revisions…';
        invoke('VersionUpdater.scan(' + JSON.stringify(mode.value) + ')', function (data) {
            if (data.ok) {
                rows = data.rows; context = data.context || {};
                if (data.labels) populateLabels(data.labels);
                rows.forEach(function (row) { row.checked = row.status === 'update' && !row.warning; }); render(rows);
                document.getElementById('context').textContent = context.compName ? 'Scanned composition(s): ' + (context.comps || [{name:context.compName}]).map(function (comp) { return comp.name; }).join(', ') + ' · direct footage layers only' : 'No composition captured. Comp-only, layer and duplicate modes require a composition.';
                compName.placeholder = context.compName ? context.compName + ' - updated' : 'Duplicate composition name (optional)';
                status.textContent = rows.length ? 'Check the versions you want to update.' : 'No source items selected. Choose Project bin or Timeline explicitly if needed.';
            } else status.textContent = data.error;
            setBusy(false);
        });
    };
    update.onclick = function () {
        if (busy) return;
        if ((action.value === 'comp' || action.value === 'add' || duplicate.checked) && !context.compId) { status.textContent = 'Select a composition in the Project bin or open the target composition, then scan again.'; return; }
        var name = compName.value.trim();
        var request = {rows: selectedRows(), context: context, options: {action: action.value, duplicateComp: duplicate.checked, compName: name, label: label.value}};
        setBusy(true); status.textContent = 'Applying checked updates…';
        invoke('VersionUpdater.apply(' + JSON.stringify(JSON.stringify(request)) + ')', function (data) {
            rows = [];
            if (data.ok) {
                var duplicateNames = (data.duplicateComps || (data.duplicateComp ? [data.duplicateComp] : [])).map(function (comp) { return comp.name; });
                render(data.results); status.textContent = data.imported ? data.imported + ' version(s) imported to the Project bin. Existing footage and timelines unchanged. Use Edit > Undo to revert.' : data.updated + ' source(s) updated' + (data.layersUpdated ? ', ' + data.layersUpdated + ' layer(s)' : '') + (duplicateNames.length ? ' in ' + duplicateNames.join(', ') : '') + '. Use Edit > Undo to revert.';
                if (data.warnings && data.warnings.length) status.textContent += ' ' + data.warnings.join(' ');
            } else status.textContent = data.error;
            setBusy(false);
        });
    };
    mode.onchange = function () { rows = []; context = {}; render([]); refreshControls(); document.getElementById('context').textContent = ''; document.getElementById('count').textContent = 'Scan selection to refresh'; };
    selectAll.onclick = function () { rows.forEach(function (row) { row.checked = row.status === 'update'; }); render(rows); refreshControls(); };
    selectNone.onclick = function () { rows.forEach(function (row) { row.checked = false; }); render(rows); refreshControls(); };
    action.onchange = duplicate.onchange = refreshScope;
    refreshScope();
}());
