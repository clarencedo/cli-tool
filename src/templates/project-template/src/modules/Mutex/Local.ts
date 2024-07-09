import CommonUtils from "../CommonUtils";
import { IMutex, IMutexLock } from ".";

const kMaxLocksPerKeyword = BigInt(50);
const kMaxPendingLocks = BigInt(10000);

export class MutexLock implements IMutexLock {
    private optMutex: Mutex;
    private optKeywords?: string[];
    private dataUnlocked: boolean = false;

    constructor(mutex: Mutex, keywords?: string[]) {
        this.optMutex = mutex;
        this.optKeywords = keywords;
    }

    release() {
        if (this.dataUnlocked) {
            return;
        }
        this.dataUnlocked = true;
        this.optMutex.unlock(this.optKeywords);
    }
}

interface MutexCallback {
    (name: MutexLock): void;
}

export default class Mutex implements IMutex {
    private dataLocks: { [key: string]: boolean } = {};
    private dataPending: {
        keywords?: string[];
        callback: MutexCallback;
    }[] = [];
    private dataLocked: boolean = false;
    private dataPendingLocksCount: { [key: string]: bigint } = {};

    private _tryAcquire(keywords?: string[]): MutexLock | undefined {
        if (this.dataLocked) {
            // Locked globally
            return undefined;
        }
        if (keywords === undefined || keywords.length === 0) {
            // Global lock
            if (Object.keys(this.dataLocks).length > 0) {
                return undefined;
            } else {
                this.dataLocked = true;
                return new MutexLock(this, undefined);
            }
        }
        for (const keyword of keywords) {
            if (this.dataLocks[keyword]) {
                return undefined;
            }
        }
        for (const keyword of keywords) {
            this.dataLocks[keyword] = true;
        }
        return new MutexLock(this, keywords);
    }

    unlock(keywords?: string[]) {
        if (keywords === undefined || keywords.length === 0) {
            if (!this.dataLocked) {
                throw new Error(
                    "Mutex status inconsistent, global lock repeated release."
                );
            }
            this.dataLocked = false;
        } else {
            if (this.dataLocked) {
                throw new Error(
                    "Mutex status inconsistent, trying to unlock a globally locked Mutex through partial lock."
                );
            }
            for (const keyword of keywords) {
                if (!this.dataLocks[keyword]) {
                    throw new Error(
                        "Mutex status inconsistent, trying to unlock a lock which has not been locked."
                    );
                }
            }
            for (const keyword of keywords) {
                this.dataLocks[keyword] = false;
                delete this.dataLocks[keyword];
            }

            // Deduct keywords
            const pendingLocksCount = this.dataPendingLocksCount;
            for (const keyword of keywords) {
                if (CommonUtils.objectHasKey(pendingLocksCount, keyword)) {
                    pendingLocksCount[keyword] =
                        pendingLocksCount[keyword] - BigInt(1);
                    if (pendingLocksCount[keyword] <= BigInt(0)) {
                        delete pendingLocksCount[keyword];
                    }
                } else {
                    // WARN keyword missing
                }
            }
        }

        for (let i = 0; i < this.dataPending.length; i++) {
            const pendingElement = this.dataPending[i];
            const lock = this._tryAcquire(pendingElement.keywords);
            if (lock !== undefined) {
                this.dataPending.splice(i, 1);
                pendingElement.callback(lock);
                return;
            }
        }
    }

    tryAcquire(keywords?: string[]): Promise<MutexLock | undefined> {
        return new Promise<MutexLock | undefined>((resolve, reject) => {
            try {
                resolve(this._tryAcquire(keywords));
            } catch (e) {
                reject(e);
            }
        });
    }

    acquire(keywords?: string[]): Promise<MutexLock> {
        return new Promise<MutexLock>((resolve, reject) => {
            // Check if we would like to accept
            if (this.dataPending.length >= kMaxPendingLocks) {
                reject(
                    new Error(
                        `Mutex acqurie rejected due to pending count reached upper limit "${kMaxLocksPerKeyword}".`
                    )
                );
                return;
            }
            const pendingLocksCount = this.dataPendingLocksCount;
            if (keywords !== undefined && keywords.length > 0) {
                for (const keyword of keywords) {
                    if (CommonUtils.objectHasKey(pendingLocksCount, keyword)) {
                        if (pendingLocksCount[keyword] >= kMaxLocksPerKeyword) {
                            reject(
                                new Error(
                                    `Mutex acquire rejected due to keyword "${keyword}" pending count reached upper limit "${kMaxLocksPerKeyword}".`
                                )
                            );
                            return;
                        }
                    }
                }
                for (const keyword of keywords) {
                    if (CommonUtils.objectHasKey(pendingLocksCount, keyword)) {
                        pendingLocksCount[keyword] =
                            pendingLocksCount[keyword] + BigInt(1);
                    } else {
                        pendingLocksCount[keyword] = BigInt(1);
                    }
                }
            }

            const tryAcquireLock = this._tryAcquire(keywords);
            if (tryAcquireLock !== undefined) {
                resolve(tryAcquireLock);
                return;
            }

            this.dataPending.push({
                keywords: keywords,
                callback: (lock) => resolve(lock),
            });
        });
    }
}
