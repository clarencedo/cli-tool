import ConfigCacheLocal from "./Local";
import ConfigCacheRemote from "./Remote";

export interface IConfigCacheConstructorOptions {
    ttl: number;
}

export interface IConfigCacheAddOptions {
    ttl: number;
    absolute: boolean;
}

export interface IConfigCache<T, V = Exclude<T, undefined>> {
    set(key: string, value: V, options?: IConfigCacheAddOptions): Promise<void>;

    get(key: string): Promise<V | undefined>;
    del(key: string): Promise<void>;
}

export interface IConfigCacheOptions<T, V> {
    ttl?: number;
    implementation?: IConfigCache<T, V>;
}

export default class ConfigCache<T, V = Exclude<T, undefined>>
    implements IConfigCache<T, V> {
    private optImplementation: IConfigCache<T, V>;

    constructor(options: IConfigCacheOptions<T, V>) {
        const implementation = options.implementation;
        if (implementation !== undefined) {
            this.optImplementation = implementation;
        } else {
            const ttl = options.ttl;
            if (ttl === undefined) {
                throw new Error(
                    "Argument options.ttl must be specified while not specifying an implementation."
                );
            }
            this.optImplementation = new ConfigCacheLocal({
                ttl: ttl,
            });
        }
    }

    async set(key: string, value: V, options?: IConfigCacheAddOptions) {
        return await this.optImplementation.set(key, value, options);
    }

    async get(key: string): Promise<V | undefined> {
        return await this.optImplementation.get(key);
    }

    async del(key: string) {
        return await this.optImplementation.del(key);
    }
}

export { ConfigCacheLocal, ConfigCacheRemote };
