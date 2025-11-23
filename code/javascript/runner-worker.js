self.onmessage = (event) => {
    const data = event.data || {};
    if (data.type !== 'run') return;

    const { id, code = '' } = data;
    const logs = [];
    let result = null;
    let error = null;

    function toLine(args) {
        return Array.prototype.slice.call(args).map((x) => String(x)).join(' ');
    }

    const fakeConsole = {
        log: (...args) => logs.push(toLine(args)),
        error: (...args) => logs.push('[err] ' + toLine(args)),
        warn: (...args) => logs.push('[warn] ' + toLine(args)),
        info: (...args) => logs.push('[info] ' + toLine(args)),
    };

    try {
        const fn = new Function('console', code);
        result = fn(fakeConsole);
    } catch (e) {
        error = 'Uncaught ' + String(e);
    }

    self.postMessage({
        type: 'run-js-result',
        id,
        logs,
        result,
        error,
    });
};
