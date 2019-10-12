export declare const config: {
    functions: {
        readonly region: "us-central1" | "us-east1" | "us-east4" | "europe-west1" | "europe-west2" | "asia-east2" | "asia-northeast1";
    };
    readonly storage: {
        readonly bucket: string;
    };
    readonly cors: {
        readonly whitelist: string[];
    };
    readonly role: {
        readonly app: {
            readonly admins: string[];
        };
    };
};
