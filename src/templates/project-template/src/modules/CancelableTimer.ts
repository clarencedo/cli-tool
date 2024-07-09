export default class CancelableTimer {
    private dataActive: boolean = false;
    private dataTimer?: NodeJS.Timeout;
    private dataResolve?: () => void;
    private dataReject?: (err: Error) => void;

    done(err?: Error) {
        try {
            if (!this.dataActive) {
                return;
            }

            if (this.dataTimer !== undefined) {
                clearTimeout(this.dataTimer);
            }

            if (err) {
                this.dataReject && this.dataReject(err);
            } else {
                this.dataResolve && this.dataResolve();
            }
        } catch (e) {
            console.error(`CancelableTimer critical error.`, e);
        } finally {
            this.dataActive = false;
            this.dataTimer = undefined;
            this.dataResolve = undefined;
            this.dataReject = undefined;
        }
    }

    delay(ms: number) {
        if (this.dataActive) {
            throw new Error(
                `CancelableTimer::delay() called while previous delay in progress.`
            );
        }

        return new Promise<void>((resolve, reject) => {
            this.dataActive = true;
            this.dataResolve = resolve;
            this.dataReject = reject;

            if (ms < 0) {
                setImmediate(() => this.done());
                return;
            }

            this.dataTimer = setTimeout(() => {
                this.done();
            }, ms);
        });
    }

    cancel() {
        this.done(new Error(`The timer event has been canceled.`));
    }
}
