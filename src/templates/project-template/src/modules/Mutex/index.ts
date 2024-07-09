import MutexLocal from "./Local";
import MutexRemote from "./Remote";

export interface IMutexLock {
    release(): void;
}

export interface IMutex {
    tryAcquire(resources?: string[]): Promise<IMutexLock | undefined>;
    acquire(resources?: string[]): Promise<IMutexLock>;
}

export interface IMutexOptions {
    implementation: IMutex;
}

export default class Mutex implements IMutex {
    private optImplementation: IMutex;

    constructor(options?: IMutexOptions) {
        if (options !== undefined) {
            this.optImplementation = options.implementation;
        } else {
            this.optImplementation = new MutexLocal();
        }
    }

    async tryAcquire(resources?: string[]) {
        return await this.optImplementation.tryAcquire(resources);
    }

    async acquire(resources?: string[]) {
        return await this.optImplementation.acquire(resources);
    }
}

type MutexLock = IMutexLock;

export { MutexLocal, MutexRemote, MutexLock };
