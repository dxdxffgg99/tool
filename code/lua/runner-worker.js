import ModuleFactory from './lua.js';

let modulePromise = null;
let currentLogs = null;

function getModule() {
    if (!modulePromise) {
        modulePromise = ModuleFactory({
            locateFile: f => f,
            print: text => {
                if (currentLogs) currentLogs.push(String(text));
            },
            printErr: text => {
                if (currentLogs) currentLogs.push(String(text));
            }
        });
    }
    return modulePromise;
}

self.onmessage = async event => {
    const data = event.data || {};
    const { type, id, code } = data;
    if (type !== 'run') return;

    currentLogs = [];
    let error = null;
    let result = null;

    try {
        const Module = await getModule();

        const L = Module._luaL_newstate();
        Module._luaL_openlibs(L);

        const ptr = Module.allocateUTF8(code);
        const loadStatus = Module._luaL_loadstring(L, ptr);

        if (loadStatus !== 0) {
            const errPtr = Module._lua_tolstring(L, -1, 0);
            error = Module.UTF8ToString(errPtr);
            Module._lua_close(L);
        } else {
            const callStatus = Module._lua_pcallk(L, 0, -1, 0, 0, 0);
            if (callStatus !== 0) {
                const errPtr = Module._lua_tolstring(L, -1, 0);
                error = Module.UTF8ToString(errPtr);
            }
            Module._lua_close(L);
        }
    } catch (e) {
        error = e && e.message ? e.message : String(e);
    }

    const logs = currentLogs ? currentLogs.slice() : [];
    currentLogs = null;

    self.postMessage({
        type: 'run-lua-result',
        id,
        logs,
        result,
        error
    });
};
