import { test, expect, is } from "@benchristel/taste"

export function resolvablePromise<T>(): [Promise<T>, (value: T) => void] {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((_resolve) => (resolve = _resolve))
  return [promise, resolve]
}

test("a resolvablePromise", {
  async "resolves when you call the returned resolve function"() {
    const [promise, resolve] = resolvablePromise<number>()
    resolve(55)
    expect(await promise, is, 55)
  },
})
