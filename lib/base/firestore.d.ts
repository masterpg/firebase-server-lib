/**
 * Firestoreのトランザクションで複数の処理を並列実行する際、
 * 各処理の書き込み処理の準備が整うまで待機するのを制御するためのオブザーバーです。
 */
export declare class WriteReadyObserver {
    private m_num;
    constructor(m_num: number);
    private m_resolves;
    wait(): Promise<void>;
    private m_decrement;
}
