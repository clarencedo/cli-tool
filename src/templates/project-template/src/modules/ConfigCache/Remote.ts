import {
    IConfigCache,
    IConfigCacheConstructorOptions,
    IConfigCacheAddOptions,
} from ".";
import { RedisClient } from "redis";
import v8 from "v8";

export interface IConfigCacheRemoteConstructorOptions
    extends IConfigCacheConstructorOptions {
    client: RedisClient;
    project: string;
    scope: string;
}

const PromiseSet = (
    client: RedisClient,
    key: string,
    value: string,
    ttl: number
) =>
    new Promise<string>((resolve, reject) =>
        client.setex(key, ttl, value, (err, res) =>
            err ? reject(err) : resolve(res)
        )
    );

const PromiseGet = (client: RedisClient, key: string) =>
    new Promise<string | null>((resolve, reject) =>
        client.get(key, (err, res) => (err ? reject(err) : resolve(res)))
    );

const PromiseDel = (client: RedisClient, key: string) =>
    new Promise((resolve, reject) =>
        client.del(key, (err, res) => (err ? reject(err) : resolve(res)))
    );

export default class ConfigCache<T, V = Exclude<T, undefined>>
    implements IConfigCache<T, V> {
    private optTtl: number;
    private optRedisClient: RedisClient;
    private optProjectScopePrefix: string;

    constructor(options: IConfigCacheRemoteConstructorOptions) {
        this.optTtl = options.ttl;
        this.optRedisClient = options.client;
        this.optProjectScopePrefix = [
            "ConfigCache",
            encodeURIComponent(options.project),
            encodeURIComponent(options.scope),
            "",
        ].join("/");
    }

    private generateKey(key: string) {
        return this.optProjectScopePrefix + encodeURIComponent(key);
    }

    async set(key: string, value: V, options?: IConfigCacheAddOptions) {
        if (value === undefined) {
            throw new Error(
                `ConfigCache::add() requires argument 2 to be a non-Undefined value.`
            );
        }

        const now = Date.now();

        let exp = this.optTtl;
        if (options !== undefined) {
            if (options.absolute) {
                exp = Math.round(options.ttl - now / 1000);
            } else {
                exp = Math.round(options.ttl);
            }
        }

        if (exp <= 0) {
            return;
        }

        try {
            await PromiseSet(
                this.optRedisClient,
                this.generateKey(key),
                v8.serialize(value).toString("base64"),
                exp
            );
        } catch (e) {
            console.warn(`Unable to save key "%s" to ConfigCache.`, key);
        }
    }

    async get(key: string): Promise<V | undefined> {
        try {
            const response = await PromiseGet(
                this.optRedisClient,
                this.generateKey(key)
            );
            if (response === null) {
                return undefined;
            }
            return v8.deserialize(Buffer.from(response, "base64"));
        } catch (e) {
            console.warn(
                `Unable to retrieve value for key "%s" from ConfigCache.`,
                key
            );
            return undefined;
        }
    }

    async del(key: string) {
        try {
            await PromiseDel(this.optRedisClient, this.generateKey(key));
        } catch (e) {
            console.warn(
                `Unable to delete value for key "%s" from ConfigCache.`,
                key
            );
        }
    }
}
