import https from "https";
import { URL } from "url";
import fetch, { Headers, RequestInit, Response } from "node-fetch";

const kUserAgent = "FOMOPay/2.0 (+http://www.fomopay.com/)";

export type TRequestConstructorOptions = {
    maxSize?: number;
    timeout?: number;
    rejectUnauthorized?: boolean;
};

export interface URLLike {
    href: string;
}

export type TRequestFetchUrl = string | URLLike;

export type TRequestFetchInit = RequestInit;

export default class Request {
    private optMaxSize: number;
    private optTimeout: number;
    private optRejectUnauthorized: boolean;

    /**
     * `rejectUnauthorized` priority (from high to low)
     * @ConstructorOptions
     * @ExecOptions
     * @StaticProperty (this property)
     */
    static rejectUnauthorized?: boolean;

    /**
     * Module for making HTTP calls
     */
    constructor(options: TRequestConstructorOptions = {}) {
        this.optMaxSize = options.maxSize ?? 250000000;
        this.optTimeout = options.timeout ?? 25000;
        this.optRejectUnauthorized =
            options.rejectUnauthorized ?? Request.rejectUnauthorized ?? false;
    }

    async fetch(
        request: TRequestFetchUrl,
        init?: TRequestFetchInit
    ): Promise<Response> {
        const maxSize = this.optMaxSize;
        const timeout = this.optTimeout;
        const rejectUnauthorized = this.optRejectUnauthorized;

        const securityEnhancedInit: RequestInit = {
            redirect: "manual",
            size: maxSize,
            timeout: timeout,
            follow: 0,
            compress: false,
            ...(init ?? {}),
        };

        if (securityEnhancedInit.headers === undefined) {
            securityEnhancedInit.headers = new Headers({
                "User-Agent": kUserAgent,
            });
        } else {
            securityEnhancedInit.headers = new Headers(
                securityEnhancedInit.headers
            );
            if (!securityEnhancedInit.headers.has("User-Agent")) {
                securityEnhancedInit.headers.set("User-Agent", kUserAgent);
            }
        }

        if (rejectUnauthorized === false) {
            if (securityEnhancedInit.agent !== undefined) {
                if (typeof securityEnhancedInit.agent === "function") {
                    const func = securityEnhancedInit.agent;
                    securityEnhancedInit.agent = (parsedUrl: URL) => {
                        const agent = func(parsedUrl);
                        if (agent instanceof https.Agent) {
                            agent.options.rejectUnauthorized = false;
                        }
                        return agent;
                    };
                } else {
                    const agent = securityEnhancedInit.agent;
                    if (agent instanceof https.Agent) {
                        agent.options.rejectUnauthorized = false;
                    }
                }
            } else {
                securityEnhancedInit.agent = (parsedUrl: URL) => {
                    if (parsedUrl.protocol === "https:") {
                        return new https.Agent({
                            rejectUnauthorized: false,
                        });
                    }
                };
            }
        }

        return await fetch(request, securityEnhancedInit);
    }
}
