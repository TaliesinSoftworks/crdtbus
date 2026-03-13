import Peer, { DataConnection } from "peerjs";
export declare function createPeer(params: {
    peerId?: string;
    signalingServerHost: string;
    iceServers?: RTCIceServer[];
}): Promise<Peer>;
export declare function connect(me: Peer, otherPeerId: string): Promise<DataConnection>;
