export function spy() {
    const calls = [];
    const spyFunc = function (...args) {
        calls.push(args);
    };
    spyFunc.calls = calls;
    return spyFunc;
}
