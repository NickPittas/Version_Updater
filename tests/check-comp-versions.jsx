#target aftereffects
(function () {
    var folder = null, selection = app.project.selection, active = app.project.activeItem, report = {passed:false};
    function assert(value, message) { if (!value) throw new Error(message); }
    function select(items) {
        for (var i = 1; i <= app.project.numItems; i++) app.project.item(i).selected = false;
        for (var j = 0; j < items.length; j++) items[j].selected = true;
    }
    try {
        $.evalFile(new File('C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx'));
        folder = app.project.items.addFolder('__VU_CompVersions_' + (new Date()).getTime());
        var a = app.project.items.addComp('__VU_A', 320, 180, 1, 1, 25); a.parentFolder = folder;
        var b = app.project.items.addComp('__VU_B', 320, 180, 1, 1, 25); b.parentFolder = folder;
        var other = app.project.items.addComp('__VU_Unrelated', 320, 180, 1, 1, 25); other.parentFolder = folder;
        var sources = [], paths = [], passes = ['albedo','diffuse','reflections'];
        for (var p = 0; p < passes.length; p++) {
            var input = new ImportOptions(new File('C:/Users/Nick/Documents/Version_Updater/tests/fixtures/card/card_r11/card_' + passes[p] + '_r11_0001.bmp'));
            input.sequence = true; input.forceAlphabetical = false;
            var source = app.project.importFile(input); source.parentFolder = folder; source.label = 5;
            sources.push(source); paths.push(source.file.fsName);
            var layer = a.layers.add(source); layer.name = 'Keep ' + passes[p]; layer.locked = true; layer.label = 2;
            layer.property('ADBE Transform Group').property('ADBE Opacity').setValueAtTime(0,25);
            layer.property('ADBE Transform Group').property('ADBE Opacity').setValueAtTime(0.5,75);
            b.layers.add(source); other.layers.add(source);
        }
        // Shared footage across two selected comps is scanned once and targeted in both.
        other.openInViewer(); select([a,b]);
        var scan = JSON.parse(VersionUpdater.scan('project'));
        assert(scan.ok && scan.rows.length === 3 && scan.context.comps.length === 2, 'Selected comp scan: ' + JSON.stringify(scan));
        for (p = 0; p < scan.rows.length; p++) assert(scan.rows[p].targets.length === 2 && scan.rows[p].to === 12, 'Wrong target scope');
        // An invalidated layer rejects its row before importing.
        var stale = JSON.parse(JSON.stringify(scan)); stale.rows = [stale.rows[0]]; stale.rows[0].targets[0].layerId = -1;
        var rejected = JSON.parse(VersionUpdater.apply(JSON.stringify({rows:stale.rows,context:stale.context,options:{action:'comp'}})));
        assert(rejected.ok && rejected.updated === 0 && rejected.results[0].status === 'error', 'Stale layer was accepted');
        var result = JSON.parse(VersionUpdater.apply(JSON.stringify({rows:scan.rows,context:scan.context,options:{action:'comp',label:'11'}})));
        assert(result.ok && result.updated === 3 && result.layersUpdated === 6 && !result.duplicateComp, 'Comp update: ' + JSON.stringify(result));
        var versionFolder = null;
        for (p = 0; p < result.results.length; p++) {
            var fresh = app.project.itemByID(result.results[p].importedItemId);
            assert(fresh && fresh.parentFolder.name === 'card_12' && fresh.parentFolder.parentFolder.id === folder.id && !fresh.mainSource.isStill && fresh.label === 11, 'Sequence bin incorrect');
            if (versionFolder) assert(versionFolder.id === fresh.parentFolder.id, 'Passes split into separate folders');
            versionFolder = fresh.parentFolder;
        }
        assert(versionFolder.numItems === 3, 'Wrong version folder item count');
        for (p = 0; p < 3; p++) {
            assert(sources[p].file.fsName === paths[p] && sources[p].label === 5, 'Original footage changed');
            assert(other.layer(p+1).source.parentFolder.id === folder.id, 'Unrelated comp changed');
            var updatedLayer = a.layer(p+1);
            assert(updatedLayer.source.parentFolder.id === versionFolder.id && updatedLayer.locked && updatedLayer.label === 11 && updatedLayer.name.indexOf('Keep ') === 0, 'Layer state lost');
            assert(updatedLayer.property('ADBE Transform Group').property('ADBE Opacity').numKeys === 2, 'Keyframes lost');
        }
        // Explicit older import creates sibling card_11, then latest returns to existing card_12.
        select([a.layer(1).source]);
        var next = JSON.parse(VersionUpdater.scan('project'));
        var older = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row:next.rows[0],version:11})));
        var imported = JSON.parse(VersionUpdater.apply(JSON.stringify({rows:[older.row],context:{},options:{action:'import'}})));
        var oldCopy = app.project.itemByID(imported.results[0].importedItemId);
        assert(oldCopy.parentFolder.name === 'card_11' && oldCopy.parentFolder.parentFolder.id === folder.id, 'Nested version folder created');
        select([oldCopy]); var again = JSON.parse(VersionUpdater.scan('project'));
        var latest = JSON.parse(VersionUpdater.apply(JSON.stringify({rows:again.rows,options:{action:'import'}})));
        assert(app.project.itemByID(latest.results[0].importedItemId).parentFolder.id === versionFolder.id, 'Existing version folder was not reused');
        // Duplicate both selected comps, keep their existing updated layer sources.
        select([a,b]); var dupScan = JSON.parse(VersionUpdater.scan('project'));
        for (p = 0; p < dupScan.rows.length; p++) dupScan.rows[p] = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row:dupScan.rows[p],version:11}))).row;
        var duplicate = JSON.parse(VersionUpdater.apply(JSON.stringify({rows:dupScan.rows,context:dupScan.context,options:{action:'comp',duplicateComp:true}})));
        assert(duplicate.ok && duplicate.updated === 3 && duplicate.duplicateComps.length === 2 && duplicate.layersUpdated === 6, 'Multiple duplicates failed: ' + JSON.stringify(duplicate));
        assert(a.layer(1).source.parentFolder.id === versionFolder.id && b.layer(1).source.parentFolder.id === versionFolder.id, 'Original selected comps changed');
        report = {passed:true,host:app.version,checks:['Project-bin comp scan','Multiple selected comps and source deduplication','Comp-only replacement and unrelated comp isolation','Original bin footage preserved','Passes grouped in shared card_12 folder','Sequence mode, labels, locks, names and keyframes preserved','Stale-layer rejection','Sibling version folders and folder reuse','Multiple duplicate comps isolated']};
    } catch (error) { report.error = error.toString(); report.line = error.line; }
    finally {
        try { if (folder) folder.remove(); } catch (error) { report.cleanupError = error.toString(); }
        select([]); for (var s = 0; s < selection.length; s++) try { selection[s].selected = true; } catch (_selection) {}
        try { if (active instanceof CompItem) active.openInViewer(); } catch (_viewer) {}
        var output = new File('C:/Users/Nick/Documents/Version_Updater/tests/comp-versions-verification.json'); output.open('w'); output.write(JSON.stringify(report)); output.close();
    }
}());
