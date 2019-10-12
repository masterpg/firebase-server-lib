"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Firestoreのトランザクションで複数の処理を並列実行する際、
 * 各処理の書き込み処理の準備が整うまで待機するのを制御するためのオブザーバーです。
 */
class WriteReadyObserver {
    constructor(m_num) {
        this.m_num = m_num;
        this.m_resolves = [];
    }
    wait() {
        const result = new Promise(resolve => {
            this.m_resolves.push(resolve);
        });
        this.m_decrement();
        return result;
    }
    m_decrement() {
        this.m_num--;
        if (this.m_num === 0) {
            for (const resolve of this.m_resolves) {
                resolve();
            }
        }
    }
}
exports.WriteReadyObserver = WriteReadyObserver;
//# sourceMappingURL=firestore.js.map