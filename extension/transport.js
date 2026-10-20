/* CEP callbacks can be empty on AE/Windows. A unique response file is authoritative. */
(function (root) {
    'use strict';
    function normalizePath(value) {
        return decodeURI(String(value).replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, ''));
    }
    function buildScript(hostPath, responsePath, expression) {
        return '(function(){var result;try{' +
            '$.evalFile(new File(' + JSON.stringify(hostPath) + '));' +
            'result=' + expression + ';' +
            '}catch(e){result=JSON.stringify({ok:false,error:e.toString(),line:e.line});}' +
            'var f=new File(' + JSON.stringify(responsePath) + ');' +
            'if(!f.parent.exists&&!f.parent.create())throw new Error("Cannot create response folder");' +
            'f.encoding="UTF-8";if(!f.open("w"))throw new Error("Cannot write response: "+f.error);' +
            'try{f.write(result);}finally{f.close();}return result;}());';
    }
    function create(cepHost, cepFs, timers) {
        return function invoke(expression, callback) {
            var id = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
            var extensionPath = normalizePath(cepHost.getSystemPath('extension'));
            var responsePath = normalizePath(cepHost.getSystemPath('userData')) + '/VersionUpdater/response-' + id + '.json';
            var done = false, started = Date.now(), lastResponse = '', pollTimer;
            var scriptPath = extensionPath + '/jsx/request-' + id + '.jsx';
            var timeoutMs = expression.indexOf('VersionUpdater.apply(') === 0 ? 600000 : 300000;
            function finish(data) {
                if (done) return; done = true;
                timers.clearTimeout(pollTimer);
                try { cepFs.deleteFile(responsePath); } catch (_) {}
                try { cepFs.deleteFile(scriptPath); } catch (_) {}
                callback(data);
            }
            function parse(value) {
                if (!value) return false;
                try {
                    var result = JSON.parse(value.replace(/^\uFEFF/, ''));
                    if (!result || typeof result.ok !== 'boolean') return false;
                    finish(result); return true;
                } catch (_) { return false; }
            }
            function poll() {
                if (done) return;
                var response = cepFs.readFile(responsePath);
                if (response && response.err === 0 && parse(response.data)) return;
                if (Date.now() - started > timeoutMs) {
                    finish({ok:false,error:'After Effects did not complete the request within ' + (timeoutMs / 1000) + ' seconds. ' +
                        'Check for an open dialog and enable Allow Scripts to Write Files and Access Network in AE Scripting & Expressions preferences.' +
                        ' If AE is still processing, let it finish before scanning again.' +
                        (lastResponse ? ' Host response: ' + lastResponse : '')}); return;
                }
                pollTimer = timers.setTimeout(poll, 100);
            }
            pollTimer = timers.setTimeout(poll, 100);
            try {
                var script = buildScript(extensionPath + '/jsx/host.jsx', responsePath, expression);
                // Pass only a short evalFile expression through the native CEP string bridge.
                var saved = cepFs.writeFile(scriptPath, script);
                if (!saved || saved.err !== 0) throw new Error('Cannot write the request script in the extension folder.');
                cepHost.evalScript('$.evalFile(new File(' + JSON.stringify(scriptPath) + '));', function (value) {
                    if (done) return; lastResponse = value;
                    // Fast path on hosts whose native callback works. Empty callbacks leave polling active.
                    parse(value);
                });
            } catch (error) { finish({ok:false,error:error.message || String(error)}); }
        };
    }
    var api = {create:create, buildScript:buildScript};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VersionUpdaterTransport = api;
}(this));
