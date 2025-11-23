        const exurlForm = document.getElementById("exurl-form");
        const exurlInput = document.getElementById("exurl-input");
        const exurlFollow = document.getElementById("exurl-follow");
        const exurlHeadOnly = document.getElementById("exurl-headonly");
        const exurlResult = document.getElementById("exurl-result");
        const exurlStatusPill = document.getElementById("exurl-status-pill");
        const exurlMeta = document.getElementById("exurl-meta");
        const exurlSubmit = document.getElementById("exurl-submit");

        function setStatus(state, text) {
            exurlStatusPill.textContent = text;
            exurlStatusPill.classList.remove(
                "dt-status-idle",
                "dt-status-loading",
                "dt-status-ok",
                "dt-status-error"
            );
            exurlStatusPill.classList.add(state);
        }

        exurlForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const url = exurlInput.value.trim();
            if (!url) return;

            let endpoint = "https://exurl-api.dxdxffg.com/api/exurl?url=" + encodeURIComponent(url);
            if (exurlFollow.checked) endpoint += "&follow=1";
            if (exurlHeadOnly.checked) endpoint += "&head=1";

            exurlSubmit.disabled = true;
            setStatus("dt-status-loading", "요청 중...");
            exurlMeta.textContent = "";
            exurlResult.textContent = "요청을 보내는 중입니다...";

            const started = performance.now();
            try {
                const res = await fetch(endpoint);
                const elapsed = Math.round(performance.now() - started);

                let data;
                try {
                    data = await res.json();
                } catch {
                    data = { raw: await res.text() };
                }

                const status = data.status || res.status;
                const finalUrl = data.finalUrl || data.url || data.requestedUrl || "";
                const ok = !!data.ok || (status >= 200 && status < 300);

                setStatus(ok ? "dt-status-ok" : "dt-status-error", ok ? "성공" : "실패");
                exurlMeta.textContent =
                    (status ? "HTTP " + status + (res.statusText ? " " + res.statusText : "") : "") +
                    (finalUrl ? " · " + finalUrl : "") +
                    " · " + elapsed + " ms";

                exurlResult.textContent = JSON.stringify(data, null, 2);
            } catch (err) {
                setStatus("dt-status-error", "에러");
                exurlMeta.textContent = "";
                exurlResult.textContent = "요청 실패: " + String(err);
            } finally {
                exurlSubmit.disabled = false;
            }
        });