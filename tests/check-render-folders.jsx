#target aftereffects
// Read-only filesystem verification: no project item imports, relinks or source replacements.
(function () {
    $.evalFile(new File("C:/Users/Nick/Documents/Version_Updater/extension/jsx/host.jsx"));
    var cases = [
        {path: "S:/2026_08_15  SKRATS 7aria Sailing/3D/RENDERs/sh10/sailboat_sh10_r12/sailboat_sh10_r12_0000.exr", sequence: true, expected: 14},
        {path: "S:/2026_09_18  NOUNOU Kefir/3D/RENDERs/SH10/sh10_r101/sh10_r101_0559.exr", sequence: true, expected: 105},
        {path: "S:/2026_07_17  Fourlis Group  Corporate KX/3D/RENDERs/SH10/r18/reflections/Fourlis_group_corpoprate_SH10_r18_reflections_0000.exr", sequence: true, expected: 19},
        {path: "S:/2026_08_15  SKRATS 7aria Sailing/3D/RENDERs/Sailboat_r12/SailBoat_r12_GI_.exr", sequence: false, expected: 22},
        {path: "S:/2026_07_17  Fourlis Group  Corporate KX/3D/RENDERs/SH30/r08/Fourlis_group_corpoprate_SH30_r08_0000.exr", sequence: true, expected: 9},
        {path: "S:/2026_08_15  SKRATS 7aria Sailing/3D/RENDERs/Sailboat_r10/Sailboat_r10_.png", sequence: false, expected: 11, expectedVersions: "11,10"}
    ];
    var report = {passed: true, cases: []};
    for (var i = 0; i < cases.length; i++) {
        var result = JSON.parse(VersionUpdater.inspectSource(cases[i].path, cases[i].sequence));
        var passed = result.ok && result.decision.status === "update" && result.decision.to === cases[i].expected;
        if (cases[i].expectedVersions && result.ok) passed = passed && result.decision.versions.join(",") === cases[i].expectedVersions;
        report.cases.push({source: cases[i].path, expected: cases[i].expected, passed: passed, result: result});
        if (!passed) report.passed = false;
    }
    var file = new File("C:/Users/Nick/Documents/Version_Updater/tests/render-folder-verification.json");
    file.encoding = "UTF-8"; file.open("w"); file.write(JSON.stringify(report)); file.close();
}());
