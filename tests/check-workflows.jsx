#target aftereffects
(function () {
    var report = {passed: false}, folder = null, originalSelection = app.project.selection, originalActive = app.project.activeItem;
    function assert(value, message) { if (!value) throw new Error(message); }
    function item(id) { return app.project.itemByID(id); }
    try {
        $.evalFile(new File("C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx"));
        folder = app.project.items.addFolder("__VersionUpdater_Workflow_Test_" + (new Date()).getTime());
        var root = "C:/Users/Nick/Documents/Version_Updater/tests/fixtures/";
        function importOld(name) {
            var f = app.project.importFile(new ImportOptions(new File(root + name + "_v001.bmp"))); f.parentFolder = folder; return f;
        }
        var first = importOld("picture"), second = importOld("other");
        first.label = 9;
        function createFixture(name) {
            var comp = app.project.items.addComp(name, 320, 180, 1, 2, 25); comp.parentFolder = folder;
            var a = comp.layers.add(first), b = comp.layers.add(second), c = comp.layers.add(first);
            a.name = "Original custom layer"; a.startTime = 0.25; a.inPoint = 0.5; a.outPoint = 1.5;
            a.label = 9; c.label = 1;
            a.property("ADBE Transform Group").property("ADBE Position").setValueAtTime(0.5, [10, 20]);
            a.property("ADBE Transform Group").property("ADBE Position").setValueAtTime(1, [30, 40]);
            a.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
            comp.openInViewer();
            for (var l = 1; l <= comp.numLayers; l++) comp.layer(l).selected = false;
            a.selected = true; b.selected = true; c.selected = true;
            return {comp: comp, a: a, b: b, c: c};
        }
        function scan() { var value = JSON.parse(VersionUpdater.scan("timeline")); assert(value.ok, value.error); return value; }
        function apply(preview, action, duplicate, label) {
            var response = JSON.parse(VersionUpdater.apply(JSON.stringify({rows: preview.rows, context: preview.context, options: {action: action, duplicateComp: duplicate, label: label === undefined ? "auto" : label}})));
            assert(response.ok, response.error); assert(response.updated === 1, "Wrong update count: " + JSON.stringify(response));
            assert(response.results.length === 1 && response.results[0].status === "updated", "Unexpected workflow result"); return response;
        }
        function checkOnlyFirst(preview) {
            for (var i = 0; i < preview.rows.length; i++) preview.rows[i].checked = preview.rows[i].itemId === first.id;
        }
        var f = createFixture("__VU_Add_Test"), p = scan(); checkOnlyFirst(p);
        assert(p.rows.length === 2, "Shared footage was not deduplicated");
        f.a.locked = true;
        var response = apply(p, "add", false);
        assert(f.comp.numLayers === 5 && response.layersUpdated === 2, "Add mode did not add both matching layers");
        assert(first.file.name === "picture_v001.bmp" && second.file.name === "other_v001.bmp", "Original footage was mutated");
        var above = f.comp.layer(f.a.index - 1);
        assert(above.source.file.name === "picture_v010.bmp", "Updated layer is not directly above original");
        assert(above.label !== f.a.label && above.source.label !== first.label, "Automatic labels are not different");
        assert(f.a.label === 9 && first.label === 9, "Original labels changed");
        assert(above.inPoint === f.a.inPoint && above.outPoint === f.a.outPoint && above.startTime === f.a.startTime, "Layer timing changed");
        assert(above.property("ADBE Transform Group").property("ADBE Position").numKeys === 2, "Animation lost");
        assert(above.property("ADBE Effect Parade").numProperties === 1, "Effect lost");
        assert(f.a.locked && above.locked && f.a.name === "Original custom layer", "Lock/custom name changed");
        assert(f.b.source.id === second.id, "Unchecked footage changed");

        f = createFixture("__VU_Duplicate_Replace_Test");
        // Timeline selection must target only this instance of the shared footage.
        f.c.selected = false; f.b.selected = false;
        p = scan(); checkOnlyFirst(p);
        var originalIndex = f.a.index;
        response = apply(p, "replace", true, "11");
        var copy = item(response.duplicateComp.id);
        assert(copy.numLayers === 3 && f.comp.numLayers === 3, "Duplicate replacement changed layer counts");
        assert(copy.layer(originalIndex).source.file.name === "picture_v010.bmp", "Duplicated comp did not get new footage");
        assert(copy.layer(originalIndex).label === 11 && copy.layer(originalIndex).source.label === 11, "Explicit label not applied to layer/source");
        assert(f.a.label === 9 && first.label === 9, "Duplicate mode changed original labels");
        assert(copy.layer(f.c.index).source.id === first.id, "Unselected shared-source layer changed in duplicate");
        assert(f.a.source.id === first.id && first.file.name === "picture_v001.bmp", "Original composition/source changed");
        assert(copy.layer(originalIndex).property("ADBE Effect Parade").numProperties === 1, "Duplicate replacement lost effects");

        f = createFixture("__VU_Duplicate_Add_Test"); p = scan(); checkOnlyFirst(p);
        response = apply(p, "add", true); copy = item(response.duplicateComp.id);
        assert(copy.numLayers === 5 && f.comp.numLayers === 3, "Duplicate add touched original or wrong layer count");
        assert(f.a.source.id === first.id && f.c.source.id === first.id, "Original shared layers changed");

        f = createFixture("__VU_Keep_Labels_Test"); p = scan(); checkOnlyFirst(p);
        response = apply(p, "add", false, "keep");
        var kept = f.comp.layer(f.a.index - 1);
        assert(kept.label === f.a.label && kept.source.label === first.label, "Keep-labels option changed colors");

        // Project bin scan maps matches into the open composition.
        f = createFixture("__VU_Project_Test");
        for (var s = 1; s <= app.project.numItems; s++) app.project.item(s).selected = false;
        first.selected = true;
        p = JSON.parse(VersionUpdater.scan("project"));
        assert(p.context.compId === f.comp.id && p.rows[0].layerIds.length === 2, "Project scan lost active-comp mapping");
        assert(p.rows[0].versionChoices.join(",") === "10,2,1", "Filename version dropdown choices incomplete");
        var chosen = JSON.parse(VersionUpdater.resolveVersion(JSON.stringify({row:p.rows[0],version:2})));
        assert(chosen.ok && chosen.row.status === "update" && chosen.row.to === 2 && chosen.row.requestedVersion === 2, "Filename version dropdown resolution failed");
        p.rows[0].checked = true;
        response = apply(p, "replace", false);
        assert(first.file.name === "picture_v010.bmp", "Global replace failed");
        assert(first.label === 10 && f.a.label === 10 && f.c.label === 9, "Global replacement labels not applied");
        assert(second.file.name === "other_v001.bmp", "Unchecked second source changed");
        report = {passed: true, host: app.version, checks: ["Checked items only", "Add directly above originals", "Both footage versions retained", "Shared footage deduplicated", "Timing/effects/keyframes preserved", "Locked layers supported", "Duplicate comp with replacement", "Duplicate comp with added layers", "Only scanned timeline layers changed", "Original comp/source preserved", "Project-bin to active-comp mapping", "Legacy global replacement", "Automatic different labels", "Explicit label on source and layer", "Original labels preserved", "Keep-labels option", "Global source/layer recoloring"]};
    } catch (error) { report.error = error.toString(); report.line = error.line; }
    finally {
        try { if (folder) folder.remove(); } catch (error) { report.cleanupError = error.toString(); }
        for (var i = 0; i < originalSelection.length; i++) try { originalSelection[i].selected = true; } catch (_ignored) {}
        try { if (originalActive instanceof CompItem) originalActive.openInViewer(); } catch (_viewer) {}
        var out = new File("C:/Users/Nick/Documents/Version_Updater/tests/workflow-verification.json");
        out.open("w"); out.write(JSON.stringify(report)); out.close();
    }
}());
