import Peer, { DataConnection } from "peerjs";
export declare function createPeer(peerId?: string): Promise<Peer>;
export declare function connect(me: Peer, otherPeerId: string): Promise<DataConnection>;
