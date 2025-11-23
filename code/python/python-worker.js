import createModule from './python.mjs';

let Module = null;
let isPythonReady = false;

const postOutput = (s) => {
    postMessage({ type: 'output', content: s });
};

async function python_load_and_init_worker() {
    try {
        Module = await createModule({
            locateFile: p => p,
            print: postOutput,
            printErr: postOutput,
            noInitialRun: true,
            preRun(mod) {
                mod.FS.createPreloadedFile('/', 'python314.zip', 'python314.zip', true, true);
                mod.ENV.PYTHONHOME = '/';
                mod.ENV.PYTHONPATH = '/python314.zip';
                mod.ENV.PYTHONDONTWRITEBYTECODE = '1';
                try {
                    mod.FS.mkdir('/app');
                } catch (e) { }
            },
        });

        isPythonReady = true;
        postMessage({ type: 'ready' });

    } catch(e) {
        postMessage({ type: 'error', content: `Python 로드 중 치명적인 오류 발생: ${e}` });
    }
}

self.onmessage = (event) => {
    const data = event.data;

    if (data.type === 'run' && isPythonReady) {
        const code = data.code;
        try {
            Module.FS.writeFile('/app/main.py', code);
            Module.callMain(['-S', '/app/main.py']);

        } catch (e) {
            postMessage({ type: 'error', content: `Python 실행 오류: ${e}` });
        } finally {
            postMessage({ type: 'run_complete' });
        }
    }
};

python_load_and_init_worker();
