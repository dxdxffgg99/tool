import createModule from './python.mjs';

console.warn("\n이 페이지는 높은 주기와 높은 자원 사용을 요청할 수 있으며 CPU, GPU 성능을 요구할 수 있습니다.\n사용에 주의해 주세요.\n\nWarn Code : 0000 (need high hardware performance)");

let pythonWorker = null;

function utf8ToBase64(str) {
    try {
        const utf8String = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode('0x' + p1);
        });
        return btoa(utf8String);
    } catch (e) {
        console.error("UTF-8 to Base64 인코딩 오류:", e);
        return '';
    }
}

function base64ToUtf8(str) {
    try {
        const utf8String = atob(str);
        return decodeURIComponent(utf8String.split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        console.error("Base64 to UTF-8 디코딩 오류:", e);
        return '';
    }
}

const $log = document.getElementById('log');
let $editorElement;
let $statusSpan;
let $runCodeBtn;

const clean = s => {
    try {
        return String(s)
            .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
            .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
            .replace(/\r(?!\n)/g, '\n')
            .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
    } catch (e) {
        console.error("ANSI/Clean 처리 오류:", e);
        return String(s);
    }
};

const println = s => {
    try {
        if (!$log) {
            console.error("로그 요소($log)를 찾을 수 없습니다.");
            return;
        }
        s = clean(s);
        $log.textContent += s + '\n';
        $log.scrollTop = $log.scrollHeight;
    } catch (e) {
        console.error("로그 출력(println) 오류:", e);
    }
};

const setReady = (isReady) => {
    try {
        if (!$statusSpan || !$runCodeBtn) return;
        $statusSpan.textContent = isReady ? 'Python 3.14 ready' : 'WASM 로딩 중';
        document.querySelector("#status_outer").style.background = isReady ? '#00b900ff' : '#3498DB';
        $runCodeBtn.disabled = !isReady;
    } catch (e) {
        console.error("UI 상태 업데이트(setReady) 오류:", e);
    }
};

const runCodeInWorker = () => {
    if (!pythonWorker) {
        println('[오류] Worker가 초기화되지 않았습니다.');
        return;
    }
    if ($runCodeBtn.disabled) return;

    try {
        $log.textContent = '';

        pythonWorker.postMessage({
            type: 'run',
            code: $editorElement.getValue()
        });

        $runCodeBtn.textContent = "코드 실행 중...";
        $runCodeBtn.disabled = true;

    } catch (e) {
        println(`[오류] Worker로 코드 전송 실패: ${e.message}`);
        console.error("runCodeInWorker 오류:", e);
        setReady(true);
    }
};

function initializeWorker() {
    setReady(false);
    $runCodeBtn.textContent = "Worker 로딩 중...";

    try {
        pythonWorker = new Worker('python-worker.js', { type: 'module' });

        pythonWorker.onmessage = (event) => {
            try {
                const data = event.data;

                switch (data.type) {
                    case 'ready': 
                        setReady(true);
                        $runCodeBtn.textContent = "코드 실행";
                        break;
                    case 'output': 
                        println(data.content);
                        break;
                    case 'error': 
                        println(`[오류] ${data.content}`);
                        console.error("Worker 메시지 오류:", data.content);
                        setReady(true);
                        $runCodeBtn.textContent = "코드 실행";
                        break;
                    case 'run_complete': 
                        setReady(true);
                        $runCodeBtn.textContent = "코드 실행";
                        break;
                    default:
                        console.warn(`처리하지 않는 Worker 메시지 유형: ${data.type}`);
                }
            } catch (e) {
                console.error("Worker onmessage 처리 오류:", e);
                println(`[치명적 오류] Worker 응답 처리 중 오류: ${e.message}`);
                setReady(false); 
            }
        };

        pythonWorker.onerror = (e) => {
            println(`Worker 오류 발생: ${e.message}`);
            console.error("Worker Error:", e);
            setReady(false);
            $runCodeBtn.textContent = "로드 실패";
        };

    } catch (e) {
        console.error("Worker 초기화(new Worker) 오류:", e);
        println(`[치명적 오류] Worker를 생성하지 못했습니다. 파일 경로 또는 설정을 확인하세요. ${e.message}`);
        setReady(false);
        $runCodeBtn.textContent = "로드 실패";
    }
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        $statusSpan = document.getElementById('status');
        $runCodeBtn = document.getElementById('runCodeBtn');

        if (typeof CodeMirror === 'undefined') {
            throw new Error("CodeMirror 라이브러리를 찾을 수 없습니다. HTML에서 스크립트가 로드되었는지 확인하세요.");
        }
        $editorElement = CodeMirror.fromTextArea(
            document.getElementById('codeInput'),
            {
                lineNumbers: true,
                mode: "python",
                theme: "darcula",
                extraKeys: {
                    "Ctrl-Space": "autocomplete"
                }
            }
        );

        $runCodeBtn.addEventListener('click', runCodeInWorker);

        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (!$runCodeBtn.disabled) runCodeInWorker();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                $log.textContent = '';
            }
        });

        function updateUrlHash() {
            try {
                const code = $editorElement.getValue();
                const encodedCode = utf8ToBase64(code);
                window.history.replaceState(null, null, `#c=${encodedCode}`);
            } catch (e) {
                console.error("URL 해시 업데이트 오류:", e);
            }
        }

        function loadCodeFromUrl() {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const urlCode = params.get('c');

            if (urlCode) {
                try {
                    const code = base64ToUtf8(urlCode);
                    $editorElement.setValue(code);
                } catch (e) {
                    console.error("URL 해시 디코딩 사용 오류:", e);
                }
            } else {
                 $editorElement.setValue(
                     '# Python 3.14 WASM ready\nprint("Hello, World")\n'
                 );
            }
        }
        
        $editorElement.on('change', () => {
             try { updateUrlHash(); } catch (e) { console.error("CodeMirror change event 오류:", e); }
        });
        
        loadCodeFromUrl();
        initializeWorker();
        
    } catch (e) {
        console.error("DOMContentLoaded 초기화 중 치명적 오류:", e);
        if ($log) println(`[치명적 오류] 페이지 초기화 실패: ${e.message}`);
    }
});
