import os from "os";
import CommonUtils from "./CommonUtils";

export type JobFunction<T, V> = (data: T) => Promise<V>;

export type PromisePoolConstructorOptions<T, V> = {
    job: JobFunction<T, V>;
    concurrencyLevel?: number;
};

export type PromisePoolSpawnObject<T, V> = {
    data: T;
    promise: {
        resolve: (result: V) => void;
        reject: (reason?: any) => void;
    };
};

export default class PromisePool<T, V> {
    private optJob: JobFunction<T, V>;
    private optConcurrencyLevel: number;
    private dataRunnerJobs = 0;
    private dataQueue: PromisePoolSpawnObject<T, V>[] = [];

    constructor(options: PromisePoolConstructorOptions<T, V>) {
        this.optJob = options.job;
        this.optConcurrencyLevel = options.concurrencyLevel ?? os.cpus().length;
        CommonUtils.assert(
            this.optConcurrencyLevel > 0,
            `Concurrency level must be at least 1.`
        );
    }

    private async spawn({
        data,
        promise: { resolve, reject },
    }: PromisePoolSpawnObject<T, V>) {
        try {
            resolve(await this.optJob(data));
        } catch (e) {
            reject(e);
        } finally {
            this.dataRunnerJobs--;
            this.trigger();
        }
    }

    private trigger(): void {
        let runningJobs = this.dataRunnerJobs;
        const concurrencyLevel = this.optConcurrencyLevel;
        const queue = this.dataQueue;
        if (runningJobs >= concurrencyLevel) {
            return;
        }
        while (runningJobs < concurrencyLevel) {
            const job = queue.shift();
            if (job === undefined) {
                break;
            }
            this.spawn(job);
            runningJobs++;
        }
        this.dataRunnerJobs = runningJobs;
    }

    run(data: T): Promise<V> {
        return new Promise<V>((resolve, reject) => {
            this.dataQueue.push({
                data,
                promise: { resolve, reject },
            });
            this.trigger();
        });
    }
}
