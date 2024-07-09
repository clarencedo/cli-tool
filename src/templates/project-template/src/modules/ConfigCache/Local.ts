import {
    IConfigCache,
    IConfigCacheConstructorOptions,
    IConfigCacheAddOptions,
} from ".";
import CommonUtils from "../CommonUtils";
import CancelableTimer from "../CancelableTimer";

export default class ConfigCache<T, V = Exclude<T, undefined>>
    implements IConfigCache<T, V> {
    private optTtlMs: number;
    private dataTimer: CancelableTimer;
    private dataData: {
        [key: string]: {
            exp: number;
            value: V;
        };
    } = {};

    constructor(options: IConfigCacheConstructorOptions) {
        this.optTtlMs = Math.round(options.ttl * 1000);

        const timer = (this.dataTimer = new CancelableTimer());

        void (async () => {
            for (;;) {
                try {
                    await timer.delay(this.interval());

                    this.purge();
                } catch (e) {
                    // Noop, the cache queue has just been updated.
                }
            }
        })();
    }

    private purge() {
        const now = Date.now();

        for (const [key, val] of Object.entries(this.dataData)) {
            const { exp } = val;

            if (exp > now) {
                continue;
            }

            delete this.dataData[key];
        }
    }

    private interval() {
        let interval = 0x7fffffff;

        const now = Date.now();

        for (const [, val] of Object.entries(this.dataData)) {
            const { exp } = val;

            const int = Math.max(exp - now + 1000, 0); // Add 1000ms in case the timer times out but purging fails

            interval = Math.min(int, interval);
        }

        return interval;
    }

    async set(key: string, value: V, options?: IConfigCacheAddOptions) {
        if (value === undefined) {
            throw new Error(
                `ConfigCache::add() requires argument 2 to be a non-Undefined value.`
            );
        }

        const now = Date.now();

        let exp = this.optTtlMs + now;
        if (options !== undefined) {
            if (options.absolute) {
                exp = Math.round(options.ttl * 1000);
            } else {
                exp = Math.round(options.ttl * 1000) + now;
            }
        }

        this.dataData[key] = {
            value: value,
            exp: exp,
        };

        this.dataTimer.cancel();
    }

    async get(key: string): Promise<V | undefined> {
        if (!CommonUtils.objectHasKey(this.dataData, key)) {
            return undefined;
        }

        return this.dataData[key].value;
    }

    async del(key: string) {
        delete this.dataData[key];
    }
}
