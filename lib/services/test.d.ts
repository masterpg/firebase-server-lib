import { FirestoreServiceDI } from '../nest';
import { JSONObject } from './types';
export interface PutTestDataInput {
    collectionName: string;
    collectionRecords: JSONObject[];
}
export interface TestSignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}
declare class TestService {
    protected readonly firestoreService: FirestoreServiceDI.type;
    constructor(firestoreService: FirestoreServiceDI.type);
    putTestData(inputs: PutTestDataInput[]): Promise<void>;
    getTestSignedUploadUrls(inputs: TestSignedUploadUrlInput[]): Promise<string[]>;
    removeTestStorageFiles(filePaths: string[]): Promise<void>;
    removeTestStorageDir(dirPath: string): Promise<void>;
    private m_deleteCollection;
    private m_deleteCollectionWithFirebaseTools;
    private m_buildCollection;
    private m_createCollectionDocs;
    private m_isArray;
    private m_isObject;
}
export declare namespace TestServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof TestService;
    };
    type type = TestService;
}
export {};
