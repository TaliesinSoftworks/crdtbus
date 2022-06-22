import type { Sub, Get } from "./periodical";
export declare type Bus<T> = {
    id: string;
    readonly state: Sub<T> & Get<T>;
    readonly networkStatus: Sub<NetworkStatus> & Get<NetworkStatus>;
    readonly whosOnline: Sub<Set<string>> & Get<Set<string>>;
    apply(patch: T): void;
    close(): void;
    subscriber: () => void;
    destroy(): void;
};
export declare type BusConfig<T> = {
    readonly topic: string;
    readonly agentId: string;
    load(): T;
    save(data: T): void;
    merge(a: T, b: T): T;
};
export declare type NetworkStatus = "pending" | "connected" | "reconnecting";
export declare function Bus<T>(config: BusConfig<T>): Bus<T>;
