import { test, expect, is } from "@benchristel/taste";
export function resolvablePromise() {
    let resolve = () => { };
    const promise = new Promise((_resolve) => (resolve = _resolve));
    return [promise, resolve];
}
test("a resolvablePromise", {
    async "resolves when you call the returned resolve function"() {
        const [promise, resolve] = resolvablePromise();
        resolve(55);
        expect(await promise, is, 55);
    },
});
