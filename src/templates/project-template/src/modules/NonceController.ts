import ConfigCache from "./ConfigCache";

export type TNonceControllerConstructorOptions = {
    configCache: ConfigCache<typeof kConfigCacheElement>;
};

const kConfigCacheElement = null;

export default class NonceController {
    private optConfigCache: ConfigCache<typeof kConfigCacheElement>;

    constructor(options: TNonceControllerConstructorOptions) {
        this.optConfigCache = options.configCache;
    }

    /**
     * Add a (service, nonce) tuple to cache.
     * If the tuple already exist for non-idempotent requests, this function returns false.
     * @param {string} service Service to add
     * @param {string} nonce Nonce of the request
     * @param {boolean} idempotent Whether the request is idempotent
     * @returns {boolean} `false` when nonce conflict, `true` when validated
     */
    async add(
        service: string,
        nonce: string,
        idempotent: boolean
    ): Promise<boolean> {
        const configCache = this.optConfigCache;

        const token = `${encodeURIComponent(service)}/${encodeURIComponent(
            nonce
        )}`;

        if (!idempotent) {
            const exists = (await configCache.get(token)) !== undefined;

            if (exists) {
                return false;
            }
        }

        await configCache.set(token, kConfigCacheElement);

        return true;
    }
}
