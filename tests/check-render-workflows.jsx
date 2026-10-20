#target aftereffects
(function () {
    var folder = null, selection = app.project.selection, active = app.project.activeItem, report = {passed: false};
    function assert(value, message) { if (!value) throw new Error(message); }
    try {
        $.evalFile(new File("C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx"));
        folder = app.project.items.addFolder("__VU_Render_Test_" + (new Date()).getTime());
        var input = new ImportOptions(new File("C:/Users/Nick/Documents/Version_Updater/tests/fixtures/render/SH10/r01/reflections/shot_r01_reflections_0001.bmp"));
        input.sequence = true; input.forceAlphabetical = false;
        var source = app.project.importFile(input); source.parentFolder = folder;
        assert(!source.mainSource.isStill, "Fixture was not imported as sequence");
        var comp = app.project.items.addComp("__VU_Render_Comp", 320, 180, 1, 1, 25); comp.parentFolder = folder;
        var old = comp.layers.add(source); comp.openInViewer(); old.selected = true;
        var scan = JSON.parse(VersionUpdater.scan("timeline"));
        assert(scan.ok && scan.rows.length === 1 && scan.rows[0].to === 2, "Sibling revision scan failed: " + JSON.stringify(scan));
        assert(scan.rows[0].token === "r" && scan.rows[0].frames.count === 3 && !scan.rows[0].warning, "Sequence metadata incorrect");
        assert(scan.rows[0].target.indexOf("r02") !== -1 && scan.rows[0].target.indexOf("reflections") !== -1, "Nested pass path lost");
        var forged = JSON.parse(JSON.stringify(scan.rows)); forged[0].target = source.file.fsName;
        var rejected = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: forged})));
        assert(rejected.updated === 0 && rejected.results[0].status === "error", "Out-of-plan replacement was allowed");
        var result = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: scan.rows, context: scan.context, options: {action: "add", duplicateComp: true, label: "11"}})));
        assert(result.ok && result.updated === 1 && result.layersUpdated === 1, "Duplicate/add render workflow failed: " + JSON.stringify(result));
        var copy = app.project.itemByID(result.duplicateComp.id);
        assert(copy.numLayers === 2 && comp.numLayers === 1, "Original composition changed");
        assert(copy.layer(1).source.file.parent.parent.name === "r02", "Wrong revision imported");
        assert(!copy.layer(1).source.mainSource.isStill, "Updated sequence became a still");
        assert(source.file.parent.parent.name === "r01", "Old source was changed in add mode");
        result = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: scan.rows, options: {action: "replace", label: "keep"}})));
        assert(result.ok && result.updated === 1 && source.file.parent.parent.name === "r02" && !source.mainSource.isStill, "Cross-folder sequence replacement failed");
        comp.openInViewer(); old.selected = true;
        scan = JSON.parse(VersionUpdater.scan("timeline"));
        assert(scan.rows[0].versionChoices.join(",") === "2,1", "Revision dropdown must exclude the empty r03 folder");
        var selected = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row: scan.rows[0], version: 1})));
        assert(selected.ok && selected.row.status === "update" && selected.row.from === 2 && selected.row.to === 1, "Older revision selection failed");
        assert(selected.row.target.indexOf("r01") !== -1 && selected.row.requestedVersion === 1, "Wrong selected-revision target");
        result = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: [selected.row], context: scan.context, options: {action: "replace", duplicateComp: true}})));
        assert(result.ok && result.updated === 1, "Older revision application failed");
        var olderCopy = app.project.itemByID(result.duplicateComp.id);
        assert(olderCopy.layer(1).source.file.parent.parent.name === "r01" && source.file.parent.parent.name === "r02", "Selected older revision affected original source");
        var empty = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row: scan.rows[0], version: 3})));
        assert(empty.ok && empty.row.status === "skipped" && !empty.row.target, "Empty revision dropdown choice should not produce an update");
        var latest = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row: selected.row, version: null})));
        assert(latest.ok && latest.row.status === "current", "Latest choice unexpectedly downgrades current source");
        var same1 = app.project.importFile(input), same2 = app.project.importFile(input);
        same1.parentFolder = same2.parentFolder = folder;
        comp.openInViewer(); old.selected = false;
        var cacheLayer1 = comp.layers.add(same1), cacheLayer2 = comp.layers.add(same2);
        cacheLayer1.selected = cacheLayer2.selected = true;
        var cacheScan = JSON.parse(VersionUpdater.scan("timeline"));
        assert(cacheScan.rows.length === 2 && cacheScan.performance.cacheHits >= 5 && cacheScan.performance.directoryQueries === 5, "Identical sequence sources repeated NAS directory queries: " + JSON.stringify(cacheScan.performance));
        report = {passed: true, host: app.version, cachePerformance: cacheScan.performance, checks: ["Sibling render revision lookup", "Nested pass path retained", "Frame delimiter normalization", "Empty/variant revisions excluded", "Out-of-plan path rejected", "Duplicate/add sequence workflow", "Original source/comp preserved", "Cross-folder sequence replacement", "Sorted revision dropdown choices", "Older revision selected/applied in duplicate", "Empty chosen revision blocked", "Latest never downgrades automatically", "Identical sequences reuse NAS listings"]};
    } catch (error) { report.error = error.toString(); report.line = error.line; }
    finally {
        try { if (folder) folder.remove(); } catch (error) { report.cleanupError = error.toString(); }
        for (var i = 0; i < selection.length; i++) try { selection[i].selected = true; } catch (_selection) {}
        try { if (active instanceof CompItem) active.openInViewer(); } catch (_viewer) {}
        var output = new File("C:/Users/Nick/Documents/Version_Updater/tests/render-workflow-verification.json");
        output.open("w"); output.write(JSON.stringify(report)); output.close();
    }
}());
