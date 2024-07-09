import CommonUtils from "./CommonUtils";
import ConfigCache from "./ConfigCache";
import { DatabaseConnection, DatabaseConnectionPool } from "./Database";

type MerchantConfigConstructorOptions = {
    dbcp: DatabaseConnectionPool;
    schemaConfig: string;
};

type MerchantConfigGetOptions = {
    merchant: string;
};

type MerchantConfigGetReturn = {
    privateKey?: string;
    publicKey?: string;
    notifyUrl?: string;
} | null;

class MerchantConfig {
    private optDbcp: DatabaseConnectionPool;
    private optSchemaConfig: string;
    private dataConfigCache: ConfigCache<MerchantConfigGetReturn>;

    constructor(options: MerchantConfigConstructorOptions) {
        this.optDbcp = options.dbcp;
        this.optSchemaConfig = options.schemaConfig;
        this.dataConfigCache = new ConfigCache({ ttl: 60 });
    }

    async get(
        options: MerchantConfigGetOptions
    ): Promise<MerchantConfigGetReturn> {
        const { merchant } = options;

        if (!CommonUtils.isString(merchant)) {
            throw new Error(`Invalid merchant provided.`);
        }

        const dbcp = this.optDbcp;
        const schemaConfig = this.optSchemaConfig;
        const configCache = this.dataConfigCache;

        let dbc: DatabaseConnection | undefined;

        try {
            const cacheLookup = await configCache.get(merchant);

            if (cacheLookup !== undefined) {
                return cacheLookup;
            }

            dbc = await dbcp.getConnection();
            await dbc.startTransaction(true);

            const configResult = await dbc.query(
                `
                    SELECT
                        "privateKey",
                        "publicKey",
                        "notifyUrl"
                    FROM
                        "${schemaConfig}"."merchant"
                    WHERE
                        "merchant" = $1;
                `,
                [merchant]
            );

            await dbc.commit();
            dbc.release();
            dbc = undefined;

            if (configResult.rows.length !== 1) {
                await configCache.set(merchant, null);
                return null;
            }

            const [{ privateKey, publicKey, notifyUrl }] = configResult.rows;
            const dbLookup: MerchantConfigGetReturn = {
                privateKey: CommonUtils.assertNullableString(privateKey),
                publicKey: CommonUtils.assertNullableString(publicKey),
                notifyUrl: CommonUtils.assertNullableString(notifyUrl),
            };
            await configCache.set(merchant, dbLookup);

            return dbLookup;
        } finally {
            if (dbc) {
                dbc.disconnect();
            }
        }
    }
}

export default MerchantConfig;
