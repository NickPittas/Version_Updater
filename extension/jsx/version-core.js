/* ES3 compatible: shared by ExtendScript and the Node verification suite. */
var VersionUpdaterCore = (function () {
    function parse(name, sequence) {
        var re = /(^|[._ -])(version|ver|v|r)(\d+)(?=$|[._ -])/ig;
        var match, last = null;
        while ((match = re.exec(name)) !== null) last = match;
        if (!last) return null;
        var start = last.index + last[1].length;
        var prefix = name.substring(0, start);
        var suffix = name.substring(last.index + last[0].length);
        var frame = null;
        if (sequence) {
            var frameMatch = /^(.*?)([._ -])(\d+)(\.[^.]+)$/.exec(suffix);
            if (!frameMatch) return null;
            frame = Number(frameMatch[3]);
            suffix = frameMatch[1] + frameMatch[2] + "{frame:" + frameMatch[3].length + "}" + frameMatch[4];
        }
        return {key: prefix + "{version:" + last[2].toLowerCase() + "}" + suffix,
            version: Number(last[3]), token: last[2].toLowerCase(), frame: frame, name: name};
    }
    function choose(currentName, names, sequence, requestedVersion) {
        var current = parse(currentName, sequence);
        if (!current) return {status: "skipped", reason: "No supported version token or sequence frame number"};
        var explicit = requestedVersion !== undefined && requestedVersion !== null;
        if (explicit && requestedVersion === current.version) return {status: "current", reason: "Selected version is the current source", token: current.token};
        var bestVersion = explicit ? requestedVersion : current.version, best = [], i, candidate;
        var frameCount = null, firstFrame = null, lastFrame = null, warning = "";
        for (i = 0; i < names.length; i++) {
            candidate = parse(names[i], sequence);
            if (!candidate || candidate.key !== current.key || (explicit ? candidate.version !== requestedVersion : candidate.version <= current.version)) continue;
            if (candidate.version > bestVersion) { bestVersion = candidate.version; best = []; }
            if (candidate.version === bestVersion) best.push(candidate);
        }
        if (!best.length) return {status: explicit ? "skipped" : "current", reason: explicit ? "Selected version has no matching files" : "Already at highest version", version: current.version};
        if (sequence) {
            // Different version padding can represent separate sequences; never merge them.
            var families = {}, count = 0;
            for (i = 0; i < best.length; i++) {
                var family = best[i].name.replace(/([._ -])\d+(\.[^.]+)$/, "$1{frame}$2");
                if (!families[family]) { families[family] = true; count++; }
            }
            if (count > 1) return {status: "skipped", reason: "Ambiguous highest-version sequences"};
            var lowest = best[0];
            for (i = 1; i < best.length; i++) if (best[i].frame < lowest.frame) lowest = best[i];
            firstFrame = lowest.frame; lastFrame = lowest.frame; frameCount = best.length;
            for (i = 0; i < best.length; i++) lastFrame = Math.max(lastFrame, best[i].frame);
            if (frameCount !== lastFrame - firstFrame + 1) warning = "New sequence has missing frames";
            best[0] = lowest;
        } else if (best.length > 1) return {status: "skipped", reason: "Ambiguous highest version"};
        return {status: "update", name: best[0].name, from: current.version, to: bestVersion, token: current.token,
            frameCount: frameCount, firstFrame: firstFrame, lastFrame: lastFrame, warning: warning};
    }
    function revision(name) {
        var re = /(^|[._ -])r(\d+)(?=$|[._ -])/ig, match, last = null;
        while ((match = re.exec(name)) !== null) last = match;
        if (!last) return null;
        return {version: Number(last[2]), digits: last[2], key: (name.substring(0, last.index + last[1].length) + "{r}" + name.substring(last.index + last[0].length)).toLowerCase()};
    }
    function renderFile(name, sequence) {
        var frame = null, pattern = name;
        if (sequence) {
            var match = /^(.*?)[._ -](\d+)(\.[^.]+)$/.exec(name);
            if (!match) return null;
            frame = Number(match[2]);
            pattern = match[1] + ".{frame:" + match[2].length + "}" + match[3];
        }
        var rev = revision(pattern);
        return {key: rev ? rev.key : pattern.toLowerCase(), version: rev ? rev.version : null, frame: frame,
            family: pattern.toLowerCase()};
    }
    function chooseRender(currentName, entries, sequence, currentVersion, requestedVersion) {
        var current = renderFile(currentName, sequence), bestVersion = currentVersion, i, candidate;
        var explicit = requestedVersion !== undefined && requestedVersion !== null;
        if (!current) return {status: "skipped", reason: "Cannot identify the render sequence frame number"};
        if (current.version !== null && current.version !== currentVersion) return {status: "skipped", reason: "Filename revision differs from its revision folder"};
        if (explicit && requestedVersion === currentVersion) return {status: "current", reason: "Selected revision is the current source", token: "r"};
        var families = {}, familyCount = 0, frames = {}, frameCount = 0, duplicateFrame = false, chosen = null, firstFrame = null, lastFrame = null;
        for (i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (explicit ? entry.version !== requestedVersion : entry.version <= currentVersion || entry.version < bestVersion) continue;
            candidate = renderFile(entry.name, sequence);
            if (!candidate || candidate.key !== current.key || (candidate.version !== null && candidate.version !== entry.version)) continue;
            if (!chosen || entry.version > bestVersion) {
                bestVersion = entry.version; families = {}; familyCount = 0; frames = {}; frameCount = 0;
                duplicateFrame = false; firstFrame = null; lastFrame = null; chosen = null;
            }
            var family = entry.folder + "/" + candidate.family;
            if (!families[family]) { families[family] = true; familyCount++; }
            var frameKey = "$" + candidate.frame;
            if (frames[frameKey]) duplicateFrame = true;
            else { frames[frameKey] = true; frameCount++; }
            if (!chosen || candidate.frame < firstFrame) { chosen = entry; firstFrame = candidate.frame; }
            lastFrame = lastFrame === null ? candidate.frame : Math.max(lastFrame, candidate.frame);
        }
        if (!chosen) return {status: explicit ? "skipped" : "current", reason: explicit ? "Selected revision has no matching files for this pass" : "No newer matching render in sibling revision folders", token: "r"};
        if (duplicateFrame || familyCount !== 1) return {status: "skipped", reason: "Ambiguous render files at the selected revision"};
        var result = {status: "update", path: chosen.path, name: chosen.name, from: currentVersion, to: bestVersion, token: "r"};
        if (sequence) {
            result.frameCount = frameCount; result.firstFrame = firstFrame; result.lastFrame = lastFrame;
            if (frameCount !== result.lastFrame - result.firstFrame + 1) result.warning = "New render sequence has missing frames";
        }
        return result;
    }
    function glob(name, sequence, render, revisionDigits, probeFrame) {
        var parsed = render ? renderFile(name, sequence) : parse(name, sequence);
        if (!parsed) return "*";
        function frameMask(_match, width) { var mask = ""; for (var i = 0; i < Number(width); i++) mask += "?"; return mask; }
        return parsed.key.replace(/\{version:([^}]+)\}/g, "$1*").replace(/\{r\}/g, revisionDigits === undefined ? "r*" : "r" + revisionDigits)
            .replace(/\.\{frame:(\d+)\}/g, function (match, width) { return "?" + (probeFrame === undefined ? frameMask(match, width) : probeFrame); })
            .replace(/\{frame:(\d+)\}/g, frameMask);
    }
    return {parse: parse, choose: choose, revision: revision, renderFile: renderFile, chooseRender: chooseRender, glob: glob};
}());
if (typeof module !== "undefined" && module.exports) module.exports = VersionUpdaterCore;
