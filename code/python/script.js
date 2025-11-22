import createModule from './python.mjs';

console.warn("\n이 웹페이지는 엄청난 양의 주기억장치 용량과\n높은 CPU, GPU 성능이 요구되며 렉을 유발할 수 있습니다\n이 점에 주의해 주십시오\n\nWarn Code : 0000 (need high hardware performance)");

// 전역 WASM 상태 변수
window.isPythonLoaded = false;
window.Module = null;

// --- UTF-8 Base64 헬퍼 함수 ---
// 유니코드 문자를 Base64로 안전하게 인코딩
function utf8ToBase64(str) {
    const utf8String = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function(match, p1) {
            return String.fromCharCode('0x' + p1);
        });
    return btoa(utf8String);
}

// Base64를 유니코드 문자로 디코딩
function base64ToUtf8(str) {
    const utf8String = atob(str);
    return decodeURIComponent(utf8String.split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}
// ----------------------------

// UI 요소 변수 (DOMContentLoaded에서 할당됨)
const $log = document.getElementById('log');
let $editorElement; // CodeMirror 인스턴스가 할당됨
let $statusSpan;
let $runCodeBtn;

// ANSI 코드 제거 및 캐리지 리턴 처리
const clean = s => String(s)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

// 로그 출력 함수 (줄 바꿈 \n 추가 및 로그 스크롤)
const println = s => { 
    if (!$log) return;
    s = clean(s); 
    $log.textContent += s + '\n'; 
    $log.scrollTop = $log.scrollHeight;
};

// UI 상태 업데이트 함수
const setReady = (isReady) => { 
    if (!$statusSpan || !$runCodeBtn) return;
    $statusSpan.textContent = isReady ? 'Python 3.14 ready' : 'WASM 로딩 중…';
    document.querySelector("#status_outer").style.background = isReady ? '#00b900ff' : '#3498DB';
    $runCodeBtn.disabled = !isReady;
    window.isPythonLoaded = isReady;
};

// WASM 로딩 및 초기화 함수
async function python_load_and_init() {
    if (window.isPythonLoaded) {
        return;
    }

    try {
        setReady(false);
        $runCodeBtn.textContent = "로딩 중...";
        
        window.Module = await createModule({
            locateFile: p => p,
            print: println, // 개선된 출력 함수 적용
            printErr: println, // 개선된 출력 함수 적용
            noInitialRun: true,
            preRun(mod) {
                // WASM 환경 설정 및 파일 로드
                mod.FS.createPreloadedFile('/', 'python314.zip', 'python314.zip', true, true);
                mod.ENV.PYTHONHOME = '/';
                mod.ENV.PYTHONPATH = '/python314.zip';
                mod.ENV.PYTHONDONTWRITEBYTECODE = '1';
                try {
                    mod.FS.mkdir('/app');
                } catch (e) { /* 무시 */ }
            },
        });
        
        setReady(true);
        $runCodeBtn.textContent = "▶️ 코드 실행";
        
        // 실행 함수 정의 (파일 쓰기 후 실행)
        const runFile = () => {
            $log.textContent = '';
            window.Module.FS.writeFile('/app/main.py', $editorElement.getValue());
            window.Module.callMain(['-S', '/app/main.py']);
        };
        
        // 버튼 이벤트 연결
        $runCodeBtn.addEventListener('click', runFile);
        
        // 키보드 이벤트 연결
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'Enter') { 
                e.preventDefault(); 
                if (window.isPythonLoaded) runFile(); 
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'l') { 
                e.preventDefault(); 
                $log.textContent = ''; 
            }
        });

    } catch(e){
        println(`Python 로드 중 치명적인 오류 발생: ${e}`);
        console.error("Python 로딩 오류:", e);
        setReady(false);
        $runCodeBtn.textContent = "⚠️ 로드 실패";
    }
}


document.addEventListener('DOMContentLoaded', function() {
    // UI 요소 할당
    $statusSpan = document.getElementById('status');
    $runCodeBtn = document.getElementById('runCodeBtn');
    
    // CodeMirror 인스턴스 생성 및 할당
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
    
    // --- URL 해시 저장/불러오기 로직 ---
    function updateUrlHash() {
        const code = $editorElement.getValue();
        const encodedCode = utf8ToBase64(code); 
        
        window.history.replaceState(null, null, `#c=${encodedCode}`);
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
                console.error("URL 해시 디코딩 오류:", e);
            }
        } else {
             $editorElement.setValue(
                 '# Python 3.14 WASM ready\nprint("Hello, World")'
             );
        }
    }
    $editorElement.on('change', updateUrlHash);
    loadCodeFromUrl();
    python_load_and_init();
});