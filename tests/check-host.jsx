#target aftereffects
// Creates and removes only its own footage and composition. Does not save the project.
(function () {
    var report = {passed: false}, footage = null, comp = null, oldSelection = app.project.selection;
    function assert(value, message) { if (!value) throw new Error(message); }
    try {
        $.evalFile(new File("C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx"));
        var root = "C:/Users/Nick/Documents/Version_Updater/tests/fixtures/";
        footage = app.project.importFile(new ImportOptions(new File(root + "sound_v001.wav")));
        comp = app.project.items.addComp("__VersionUpdater_Verification__", 320, 180, 1, 1, 25);
        var layer = comp.layers.add(footage), layer2 = comp.layers.add(footage);
        layer.name = "Keep this custom name";
        layer.property("ADBE Audio Group").property("ADBE Audio Levels").setValueAtTime(0, [-10, -10]);
        layer.property("ADBE Audio Group").property("ADBE Audio Levels").setValueAtTime(0.5, [0, 0]);
        for (var i = 1; i <= app.project.numItems; i++) app.project.item(i).selected = false;
        footage.selected = true;
        var preview = JSON.parse(VersionUpdater.scan("project"));
        assert(preview.ok && preview.rows.length === 1, "Project selection scan failed");
        assert(preview.rows[0].to === 10, "Did not choose v010 numerically");
        comp.openInViewer(); layer.selected = true; layer2.selected = true;
        var timeline = JSON.parse(VersionUpdater.scan("timeline"));
        assert(timeline.ok && timeline.rows.length === 1, "Timeline sources were not deduplicated");
        var result = JSON.parse(VersionUpdater.apply(JSON.stringify(timeline.rows)));
        assert(result.ok && result.updated === 1, "Replacement failed: " + JSON.stringify(result));
        assert(footage.file.name === "sound_v010.wav", "Wrong replacement path");
        assert(layer.source.id === footage.id && layer2.source.id === footage.id, "Source identity changed");
        assert(layer.name === "Keep this custom name", "Layer name changed");
        assert(layer.property("ADBE Audio Group").property("ADBE Audio Levels").numKeys === 2, "Layer keyframes changed");
        var stale = JSON.parse(VersionUpdater.apply(JSON.stringify(preview.rows)));
        assert(stale.updated === 0 && stale.results[0].status === "error", "Stale preview was not rejected");
        var latest = JSON.parse(VersionUpdater.scan("timeline"));
        assert(latest.rows[0].status === "current", "Already-latest check failed");
        report = {passed: true, host: app.version, checks: ["Project selection", "Timeline selection", "Shared source deduplication", "Highest numeric version", "In-place source identity", "Layer name and keyframes preserved", "Stale preview rejected", "Already latest"]};
    } catch (error) { report.error = error.toString(); report.line = error.line; }
    finally {
        try { if (comp) comp.remove(); if (footage) footage.remove(); } catch (error) { report.cleanupError = error.toString(); }
        for (var j = 0; j < oldSelection.length; j++) try { oldSelection[j].selected = true; } catch (_ignored) {}
        var output = new File("C:/Users/Nick/Documents/Version_Updater/tests/host-verification.json");
        output.open("w"); output.write(JSON.stringify(report)); output.close();
    }
}());
