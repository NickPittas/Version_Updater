#target aftereffects
(function () {
    var folder = null, selection = app.project.selection, active = app.project.activeItem, report = {passed: false};
    function assert(value, message) { if (!value) throw new Error(message); }
    try {
        $.evalFile(new File("C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx"));
        folder = app.project.items.addFolder("__VU_BinOnly_" + (new Date()).getTime());
        var base = "C:/Users/Nick/Documents/Version_Updater/tests/fixtures/";
        var comp = app.project.items.addComp("__VU_BinOnly_Comp", 320, 180, 1, 2, 25); comp.parentFolder = folder;
        function run(path, sequence, expected) {
            var options = new ImportOptions(new File(path)); if (sequence) { options.sequence = true; options.forceAlphabetical = false; }
            var source = app.project.importFile(options); source.parentFolder = folder; source.label = 5;
            var layer = comp.layers.add(source); layer.name = "Original layer"; layer.label = 2;
            var beforeCount = comp.numLayers, originalPath = source.file.fsName;
            for (var i = 1; i <= app.project.numItems; i++) app.project.item(i).selected = false;
            source.selected = true;
            var scan = JSON.parse(VersionUpdater.scan("project"));
            assert(scan.ok && scan.rows.length === 1 && scan.rows[0].status === "update", "Bin scan failed: " + JSON.stringify(scan));
            var result = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: scan.rows, context: {}, options: {action: "import", label: "11"}})));
            assert(result.ok && result.imported === 1 && result.layersUpdated === 0 && !result.duplicateComp, "Bin import failed: " + JSON.stringify(result));
            var fresh = app.project.itemByID(result.results[0].importedItemId);
            assert(fresh && fresh.id !== source.id && (sequence ? fresh.parentFolder.name === "shot_2" && fresh.parentFolder.parentFolder.id === folder.id : fresh.parentFolder.id === folder.id), "New footage was not placed in expected bin/version folder");
            assert(fresh.file.name === expected && fresh.label === 11, "Wrong footage or label imported");
            assert(source.file.fsName === originalPath && source.label === 5, "Original footage changed");
            assert(comp.numLayers === beforeCount && layer.source.id === source.id && layer.name === "Original layer" && layer.label === 2, "Timeline changed in bin-only mode");
            assert(fresh.mainSource.isStill === !sequence, "Still/sequence import mode changed");
        }
        run(base + "picture_v001.bmp", false, "picture_v010.bmp");
        run(base + "render/SH10/r01/reflections/shot_r01_reflections_0001.bmp", true, "shot_r02_reflections.0001.bmp");
        report = {passed: true, host: app.version, checks: ["Bin-only still import", "Bin-only sequence import", "Original sources and labels preserved", "Existing timelines unchanged", "Both versions retained in original bin", "No composition context required", "Chosen label applied only to imported source"]};
    } catch (error) { report.error = error.toString(); report.line = error.line; }
    finally {
        try { if (folder) folder.remove(); } catch (error) { report.cleanupError = error.toString(); }
        for (var j = 0; j < selection.length; j++) try { selection[j].selected = true; } catch (_selection) {}
        try { if (active instanceof CompItem) active.openInViewer(); } catch (_viewer) {}
        var output = new File("C:/Users/Nick/Documents/Version_Updater/tests/bin-only-verification.json"); output.open("w"); output.write(JSON.stringify(report)); output.close();
    }
}());
