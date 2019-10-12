declare class FirestoreService {
    /**
     * 指定されたコレクションを再帰的に削除します。
     * @param collectionPath
     * @param batchSize
     */
    deepDeleteCollection(collectionPath: string, batchSize?: number): Promise<void>;
    /**
     * 指定されたクエリを実行し、その結果からさらにクエリの作成・実行を繰り返して、
     * 再帰的にドキュメントリファレンスを取得します。
     * @param transaction
     * @param query
     * @param batchSize
     */
    private m_getDeepDocRefs;
}
export declare namespace FirestoreServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof FirestoreService;
    };
    type type = FirestoreService;
}
export {};
