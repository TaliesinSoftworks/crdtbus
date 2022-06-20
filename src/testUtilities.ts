export type Spy<F extends AnyFunc> = {
  (...args: Parameters<F>): void;
  calls: Array<Parameters<F>>;
};

export function spy<F extends AnyFunc>(): Spy<F> {
  const calls: Array<Parameters<F>> = [];
  const spyFunc = function (...args: Parameters<F>) {
    calls.push(args);
  };
  spyFunc.calls = calls;
  return spyFunc;
}

type AnyFunc = (...args: any) => any;
