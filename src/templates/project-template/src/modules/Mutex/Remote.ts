import Redlock from "redlock";
import CommonUtils from "../CommonUtils";
import CancelableTimer from "../CancelableTimer";

import { IMutexLock, IMutex } from ".";

const kAcquireDelayInterval = 200; // ms
const kAcquireDelayIntervalMaximimumCount = 10;
const kRenewDelayInterval = 15000; // ms
const kRenewDelayIntervalMaximumDelay = 2000; // ms
const kRenewExtendInterval =
    kRenewDelayInterval * 2 + kRenewDelayIntervalMaximumDelay * 5; // ms
const kJitterPercentage = 0.33;

const jitter = (delay: number) =>
    Math.round(
        delay * (1 - kJitterPercentage + 2 * Math.random() * kJitterPercentage)
    );
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MutexLock implements IMutexLock {
    private optLock: Redlock.Lock;
    private dataUnlocked: boolean = false;
    private dataRenewalTimer: CancelableTimer;

    constructor(lock: Redlock.Lock) {
        this.optLock = lock;
        this.dataRenewalTimer = new CancelableTimer();
        this.autoRenew();
    }

    private async autoRenew() {
        const renewalTimer = this.dataRenewalTimer;
        const lock = this.optLock;

        while (true) {
            const beforeSleep = Date.now();
            try {
                await renewalTimer.delay(kRenewDelayInterval);
            } catch (e) {
                // early wake up of timer
            }
            const wakeUpDelay = Date.now() - beforeSleep;
            if (
                wakeUpDelay >
                kRenewDelayInterval + kRenewDelayIntervalMaximumDelay
            ) {
                console.warn(
                    `Wake up late for "%d" ms, possible server overload?`,
                    wakeUpDelay
                );
            }
            if (this.dataUnlocked) {
                return;
            }
            try {
                await lock.extend(kRenewExtendInterval);
            } catch (e) {
                console.warn(
                    "There was an error renewing redlock, lock possibly has expired.",
                    e
                );
            }
        }
    }

    async release() {
        const lock = this.optLock;

        if (this.dataUnlocked) {
            return;
        }
        this.dataUnlocked = true;

        try {
            this.dataRenewalTimer.cancel();
            await lock.unlock();
        } catch (e) {
            console.warn("An error occurred while releasing lock.", e);
        }
    }
}

export interface IMutexConstructorOptions {
    clients: Redlock.CompatibleRedisClient[];
    redlockOptions?: Omit<Redlock.Options, "retryCount">;
    project: string;
    scope: string;
}

interface ActiveLock {
    lock: Redlock.Lock;
    timeout: number;
}

interface PendingLock {
    keywords?: string[];
    resolve: (value: MutexLock) => void;
}

export default class Mutex implements IMutex {
    private optRedlock: Redlock;
    private optProjectScope: string;

    constructor(options: IMutexConstructorOptions) {
        this.optRedlock = new Redlock(options.clients, {
            ...options.redlockOptions,
            retryCount: 0,
        });
        this.optProjectScope = [
            "Mutex",
            encodeURIComponent(options.project),
            encodeURIComponent(options.scope),
        ].join("/");
    }

    private generateKeyword(keywords?: string[]): string[] {
        const projectScope = this.optProjectScope;

        if (keywords === undefined || keywords.length === 0) {
            return [projectScope];
        }

        return keywords
            .map((keyword) => {
                CommonUtils.assert(
                    keyword.length > 0,
                    `Keywords provided must not contain empty string.`
                );
                return keyword;
            })
            .map((keyword) => `${projectScope}/${encodeURIComponent(keyword)}`);
    }

    tryAcquire(keywords?: string[]): Promise<MutexLock | undefined> {
        const redlock = this.optRedlock;

        const convertedKeywords = this.generateKeyword(keywords);
        return new Promise<MutexLock | undefined>(async (resolve) => {
            try {
                const lock = await redlock.lock(
                    convertedKeywords,
                    kRenewExtendInterval
                );
                resolve(new MutexLock(lock));
            } catch (e) {
                resolve(undefined);
            }
        });
    }

    acquire(keywords?: string[]): Promise<MutexLock> {
        return new Promise<MutexLock>(async (resolve, reject) => {
            try {
                let delayIntervalCount = 1;
                while (true) {
                    const lock = await this.tryAcquire(keywords);
                    if (lock !== undefined) {
                        resolve(lock);
                        return;
                    }
                    await delay(
                        jitter(delayIntervalCount * kAcquireDelayInterval)
                    );
                    if (
                        delayIntervalCount < kAcquireDelayIntervalMaximimumCount
                    ) {
                        delayIntervalCount++;
                    }
                }
            } catch (e) {
                reject(e);
            }
        });
    }
}
