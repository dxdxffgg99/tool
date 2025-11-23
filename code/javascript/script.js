let editor;
let logEl;
let runBtn;
let statusSpan;
let statusOuter;

let runnerWorker = null;
let requestId = 0;
const pending = new Map();
let runBtnDefaultText = "";

function utf8ToBase64(str) {
    try {
        const utf8String = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode("0x" + p1)
        );
        return btoa(utf8String);
    } catch (e) {
        console.error("UTF-8 to Base64 인코딩 오류:", e);
        return '';
    }
}

function base64ToUtf8(str) {
    try {
        const utf8String = atob(str);
        return decodeURIComponent(
            utf8String
                .split("")
                .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
    } catch (e) {
        console.error("Base64 to UTF-8 디코딩 오류:", e);
        return '';
    }
}

function cleanOutput(s) {
    try {
        return String(s)
            .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
            .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
            .replace(/\r(?!\n)/g, "\n")
            .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
    } catch (e) {
        console.error("출력 정리(cleanOutput) 오류:", e);
        return String(s);
    }
}

function println(s) {
    try {
        if (!logEl) return;
        const text = cleanOutput(s);
        logEl.textContent += text + "\n";
        logEl.scrollTop = logEl.scrollHeight;
    } catch (e) {
        console.error("로그 출력(println) 오류:", e);
    }
}

function initWorker() {
    if (runnerWorker) return;
    try {
        runnerWorker = new Worker('runner-worker.js', { type: 'module' });
        runnerWorker.onmessage = (event) => {
            const data = event.data || {};
            if (data.type !== 'run-js-result') return;
            const cb = pending.get(data.id);
            if (!cb) return;
            pending.delete(data.id);
            cb(data);
        };
        runnerWorker.onerror = (e) => {
            console.error("Worker 오류:", e);
            println(`[Worker Error] ${e.message}`);
        };
    } catch (e) {
        console.error("Worker 초기화 오류:", e);
        println(`[치명적 오류] Worker를 생성하지 못했습니다: ${e.message}`);
    }
}

function runInWorker(code) {
    initWorker();
    if (!runnerWorker) {
        return Promise.resolve({ error: "Worker not initialized" });
    }
    const id = ++requestId;
    return new Promise((resolve) => {
        pending.set(id, resolve);
        try {
            runnerWorker.postMessage({ type: 'run', id, code });
        } catch (e) {
            pending.delete(id);
            resolve({ error: `postMessage 전송 오류: ${e.message}` });
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        logEl = document.getElementById("log");
        runBtn = document.getElementById("runCodeBtn");
        statusSpan = document.getElementById("status");
        statusOuter = document.getElementById("status_outer");

        if (runBtn) {
            runBtnDefaultText = runBtn.textContent || "코드 실행";
            runBtn.disabled = false;
        }

        if (statusSpan) statusSpan.textContent = "JS ready";
        if (statusOuter) statusOuter.style.background = "#00b900ff";
        
        const codeInputEl = document.getElementById("codeInput");
        if (!codeInputEl || typeof CodeMirror === 'undefined') {
            throw new Error("CodeMirror 라이브러리나 codeInput 요소를 찾을 수 없습니다.");
        }

        editor = CodeMirror.fromTextArea(
            codeInputEl,
            {
                lineNumbers: true,
                mode: "javascript",
                theme: "darcula",
                extraKeys: {
                    "Ctrl-Space": "autocomplete"
                }
            }
        );

        function updateUrlHash() {
            try {
                const code = editor.getValue();
                const encoded = utf8ToBase64(code);
                window.history.replaceState(null, "", "#c=" + encoded);
            } catch (e) {
                console.error("URL 해시 업데이트 오류:", e);
            }
        }

        function loadCodeFromUrl() {
            const hash = window.location.hash.slice(1);
            const params = new URLSearchParams(hash);
            const urlCode = params.get("c");
            if (urlCode) {
                try {
                    const code = base64ToUtf8(urlCode);
                    editor.setValue(code);
                    return;
                } catch (e) {
                    console.error("URL 해시 디코딩 오류:", e);
                }
            }
            editor.setValue(`console.log("Hello, JS runner");`);
        }
        
        editor.on("change", () => {
            try { updateUrlHash(); } catch (e) { console.error("CodeMirror change event 오류:", e); }
        });

        loadCodeFromUrl();
        initWorker();

        function clearLog() {
            if (logEl) logEl.textContent = "";
        }

        async function runCurrent() {
            if (!editor) return;
            const code = editor.getValue();
            clearLog();

            if (statusSpan) statusSpan.textContent = "실행 중...";
            if (statusOuter) statusOuter.style.background = "#3498DB";
            if (runBtn) {
                runBtn.disabled = true;
                runBtn.textContent = "실행 중...";
            }

            try {
                const res = await runInWorker(code);
                const logs = res.logs || [];
                const result = res.result;
                const error = res.error;

                if (logs.length) logs.forEach(l => println(l));
                
                if (typeof result !== "undefined" && result !== null) {
                    println(String(result));
                }

                if (error) {
                    println(`[Worker Error] ${error}`);
                }
            } catch (err) {
                println("[Critical Runtime Error] " + err.message);
                console.error("Critical Runtime Error:", err);
            } finally {
                if (statusSpan) statusSpan.textContent = "JS ready";
                if (statusOuter) statusOuter.style.background = "#00b900ff";
                if (runBtn) {
                    runBtn.disabled = false;
                    runBtn.textContent = runBtnDefaultText || "코드 실행";
                }
            }
        }

        if (runBtn) {
            runBtn.addEventListener("click", runCurrent);
        }

        window.addEventListener("keydown", e => {
            if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                if (runBtn && !runBtn.disabled) runCurrent();
            }
            if (e.ctrlKey && e.key.toLowerCase() === "l") {
                e.preventDefault();
                clearLog();
            }
        });
        
    } catch (e) {
        console.error("DOMContentLoaded 초기화 중 치명적 오류:", e);
        if (logEl) println(`[치명적 오류] 페이지 초기화 실패: ${e.message}`);
    }
});
