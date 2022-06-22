export declare type Spy<F extends AnyFunc> = {
    (...args: Parameters<F>): void;
    calls: Array<Parameters<F>>;
};
export declare function spy<F extends AnyFunc>(): Spy<F>;
declare type AnyFunc = (...args: any) => any;
export {};
