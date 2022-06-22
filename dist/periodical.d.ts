export declare type Consumer<T> = (val: T) => unknown;
export interface Sub<Issue> {
    sub(subscriber: Consumer<Issue>): void;
    unsub(subscriber: Consumer<Issue>): void;
}
export interface Get<Issue> {
    get(): Issue;
}
export interface Pub<Issue> {
    pub(val: Issue): void;
}
export declare type Periodical<T> = Pub<T> & Sub<T> & Get<T>;
export declare function createPeriodical<T>(val: T): Periodical<T>;
export declare function next<T>(periodical: Sub<T>): Promise<T>;
export declare function createPubSub<T>(): Pub<T> & Sub<T>;
