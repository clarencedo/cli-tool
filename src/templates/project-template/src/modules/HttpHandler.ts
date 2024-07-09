import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { finished } from "node:stream";
import { URL } from "node:url";

import Express, { Response, Router } from "express";

import CommonUtils, {
    ApiError,
    AuthError,
    HttpError,
    RateLimitError,
} from "@/modules/CommonUtils";

const kDefaultContentType = "application/octet-stream";
export const kHeaderXPoweredBy = "FOMOPay/2.0 (+http://www.fomopay.com)";

export class HttpRequestId {
    private optReqId: string;

    constructor(reqId: string) {
        this.optReqId = reqId;
    }

    toString() {
        return this.optReqId;
    }

    toJSON() {
        return this.optReqId;
    }
}

class HttpRequestData {
    private dataStorage: {
        [key: string]: {
            value: any;
            options: {
                immutable: boolean;
            };
        };
    } = {};

    set(
        key: string,
        value: any,
        options: { immutable: boolean } = { immutable: true }
    ): void {
        if (CommonUtils.objectHasKey(this.dataStorage, key)) {
            if (this.dataStorage[key].options.immutable) {
                throw new Error(
                    `Data attached to HttpRequest for key "${key}" is immutable.`
                );
            }
        }
        this.dataStorage[key] = {
            value: value,
            options: {
                immutable: options.immutable,
            },
        };
    }

    get<T = any>(key: string): T {
        if (!CommonUtils.objectHasKey(this.dataStorage, key)) {
            throw new Error(
                `No such data attached to HttpRequest for key "${key}".`
            );
        }
        return this.dataStorage[key].value;
    }
}

declare global {
    namespace Express {
        interface Request {
            hint: HttpRequestId;
            data: HttpRequestData;
            fullUrl: string;
        }
    }
}

class HttpHandlerHelper {
    static AssignHandler(
        urls: Array<IHttpRouterUrlPattern>,
        router: Express.Router,
        env: {
            [key: string]: any;
        }
    ): void {
        for (const url of urls) {
            let { handler } = url;

            const esModule = handler as unknown as {
                __esModule: boolean;
                default: HttpHandlerConstructor;
            };

            if (esModule.__esModule) {
                handler = esModule.default;
            }

            const handler_instance = new handler(env);

            router.all(
                url.path,
                async (
                    req: Express.Request,
                    res: Express.Response,
                    next: Express.NextFunction
                ) => {
                    const method = req.method.toLowerCase();
                    if (
                        !CommonUtils.isAsyncFunction(handler.prototype[method])
                    ) {
                        next();
                        return;
                    }
                    res.set("Surrogate-Control", "no-store");
                    res.set(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate, proxy-revalidate"
                    );
                    res.set("Pragma", "no-cache");
                    res.set("Expires", "0");
                    try {
                        await handler.prototype[method].call(
                            handler_instance,
                            req,
                            res,
                            next
                        );
                    } catch (e) {
                        next(e);
                    }
                }
            );
        }
    }

    static responseFinishedEvent(
        hint: HttpRequestId,
        begin: number,
        res: Response,
        err: any
    ) {
        const took = (performance.now() - begin).toFixed(6);
        if (err) {
            console.warn(
                hint,
                `Request cancelled by client in "%s" ms.`,
                took,
                err
            );
            return;
        }
        console.trace(
            hint,
            `Request completed with status code "%d" in "%s" ms.`,
            res.statusCode,
            took
        );
    }
}

interface IHttpRouterUrlPattern {
    path: string;
    handler: HttpHandlerConstructor;
}

export class HttpRouter {
    private optRouter: Express.Router = Express.Router({ caseSensitive: true });
    private optEnv: object;

    constructor(env: object) {
        let d_env = {};

        if (CommonUtils.isObject(env)) {
            d_env = env;
        }

        this.optEnv = d_env;
    }

    run(urlpatterns: Array<IHttpRouterUrlPattern>) {
        const expressRouter = this.optRouter;
        const env = this.optEnv;

        HttpHandlerHelper.AssignHandler(urlpatterns, expressRouter, env);
    }

    use<T extends any[]>(...args: T): Router {
        return this.optRouter.use(...args);
    }

    router() {
        return this.optRouter;
    }
}

interface HttpHandlerConstructor {
    new (env: { [key: string]: any }): HttpHandler;
}

export class HttpHandler {
    prototype: any;

    private optEnv: {
        [key: string]: any;
    };

    constructor(env: { [key: string]: any }) {
        this.optEnv = env;
    }

    env<T = any>(key: string): T {
        const env = this.optEnv;
        if (!CommonUtils.isString(key)) {
            throw new Error(`Argument 1 must be a String.`);
        }
        if (!CommonUtils.objectHasKey(env, key)) {
            throw new Error(
                `Key "${key}" does not exists when getting environment variables.`
            );
        }
        return env[key];
    }
}

interface IHttpServerOptions {
    caseSensitive?: boolean;
    vhosts?: Array<{ hostname: string; protocol: string }>;
    routing?: "pre" | "post";
}

interface RequestHandler {
    (
        req: Express.Request,
        res: Express.Response,
        next: Express.NextFunction
    ): any;
    (
        req: Express.Request,
        res: Express.Response,
        next: Express.NextFunction
    ): Promise<any>;
}

type IHttpServerRouter = HttpRouter | RequestHandler;

export enum EHttpServerConstructorOptionsTlsVersion {
    TLSv1 = "TLSv1",
    TLSv1_1 = "TLSv1.1",
    TLSv1_2 = "TLSv1.2",
    TLSv1_3 = "TLSv1.3",
}

export type THttpServerConstructorOptionsTls = {
    key: string | Buffer;
    cert: string | Buffer;
    ca?: string | Buffer;
    dhparam: string | Buffer;
    ciphers?: string;
    minVersion?: EHttpServerConstructorOptionsTlsVersion; // Defaults to EHttpServerConstructorOptionsTlsVersion.TLSV1_2
    maxVersion?: EHttpServerConstructorOptionsTlsVersion;
};

export type THttpServerConstructorOptionsHealthcheck = {
    path?: string; // Defaults to "/healthcheck"
    statusCode?: number; // Defaults to 200
    body?: string; // Defaults to "OK"
};

export type THttpServerConstructorOptionsOptions = {
    maxSize?: number | string;
    ignoreXForwardedHost?: boolean;
    keepAlive?: number; // In seconds
    headers?: {
        "x-app-version"?: string;
        "x-powered-by"?: string;
    };
};

export type THttpServerConstructorOptions = {
    listenPort: number;
    listenHost: string;
    tls?: THttpServerConstructorOptionsTls;
    healthcheck?: THttpServerConstructorOptionsHealthcheck;
    options?: THttpServerConstructorOptionsOptions;
};

export class HttpServer {
    private dataApp: Express.Application = Express();
    private dataErrorHandler: Function;
    private dataPreRouter: Express.Router = Express.Router({
        caseSensitive: true,
    });
    private dataRouter: Express.Router = Express.Router({
        caseSensitive: true,
    });
    private dataPostRouter: Express.Router = Express.Router({
        caseSensitive: true,
    });
    private dataExtractHostname: (req: Express.Request) => string | undefined;

    constructor({
        listenPort,
        listenHost,
        tls,
        healthcheck,
        options,
    }: THttpServerConstructorOptions) {
        const app = this.dataApp;
        this.dataErrorHandler = this.errorHandler.bind(this);
        const trustXForwardedHost = !(options?.ignoreXForwardedHost ?? false);
        this.dataExtractHostname = (req: Express.Request) => {
            if (trustXForwardedHost) {
                return req.hostname;
            }
            const host = req.get("host");
            if (!host) {
                return;
            }
            // From: https://github.com/expressjs/express/blob/b8e50568af9c73ef1ade434e92c60d389868361d/lib/request.js#L441-L449
            // IPv6 literal support
            const offset = host[0] === "[" ? host.indexOf("]") + 1 : 0;
            const index = host.indexOf(":", offset);
            return index !== -1 ? host.substring(0, index) : host;
        };

        const preRouter = this.dataPreRouter;
        const router = this.dataRouter;
        const postRouter = this.dataPostRouter;

        const startTime = new Date();

        console.log(
            "Application Starting\nTimestamp: %d\nLocal Time: %s\nTLS: %s",
            startTime.getTime(),
            startTime.toString(),
            tls !== undefined ? "On" : "Off"
        );

        let server: http.Server;
        if (tls === undefined) {
            server = http
                .createServer(this.dataApp)
                .listen(listenPort, listenHost);
        } else {
            server = https
                .createServer(
                    {
                        ...tls,
                        minVersion:
                            tls.minVersion ??
                            EHttpServerConstructorOptionsTlsVersion.TLSv1_2,
                    },
                    this.dataApp
                )
                .listen(listenPort, listenHost);
        }

        const keepAlive = options?.keepAlive;
        CommonUtils.assert(
            keepAlive === undefined || keepAlive >= 0,
            `Option keepAlive must greater than or equal to 0 if provided, but "%d" provided.`,
            keepAlive
        );
        let setConnectionClose: boolean = false;
        if (keepAlive !== undefined) {
            if (keepAlive > 0) {
                server.keepAliveTimeout = keepAlive * 1000;
                server.headersTimeout = (keepAlive + 1) * 1000;
            } else {
                setConnectionClose = true;
            }
        }

        server.on("error", (e: NodeJS.ErrnoException) => {
            if (e.code !== "EADDRINUSE") {
                console.warn(
                    `Unable to listen on port "%d" host "%s".`,
                    listenPort,
                    listenHost,
                    e
                );
                process.exit(1);
                return;
            }
            setTimeout(() => {
                server.listen(listenPort, listenHost);
            }, 1000);
            console.warn(
                `Unable to listen on port "%d" host "%s" (EADDRINUSE), retrying in 1 second.`,
                listenPort,
                listenHost
            );
        });
        server.on("listening", () => {
            const whatwgUrl = new URL("http://example.com");
            whatwgUrl.protocol = tls ? "https:" : "http:";
            whatwgUrl.port = listenPort.toFixed(0);
            whatwgUrl.hostname = listenHost;
            console.log(`HTTP Status\n` + `Listen: %s`, whatwgUrl.href);
        });
        process.on("SIGTERM", () => {
            const teardownTime = new Date();
            console.info(
                "HTTP Server Stopping\nTimestamp: %d\nLocal Time: %s",
                teardownTime.getTime(),
                teardownTime.toString()
            );
            server.close(() => {
                const stopTime = new Date();
                console.info(
                    "HTTP Server Stopped\nTimestamp: %d\nLocal Time: %s",
                    stopTime.getTime(),
                    stopTime.toString()
                );
            });
        });

        app.disable("x-powered-by");
        app.disable("etag");
        app.enable("trust proxy");

        app.get(healthcheck?.path ?? "/healthcheck", (req, res) => {
            res.status(healthcheck?.statusCode ?? 200)
                .set("Content-Type", "text/plain; charset=utf-8")
                .send(healthcheck?.body ?? "OK");
        });

        const headerXAppVersion = options?.headers?.["x-app-version"];
        const headerXPoweredBy = options?.headers?.["x-powered-by"];

        app.use((req, res, next) => {
            req.hint = new HttpRequestId(CommonUtils.generateShortId());
            req.data = new HttpRequestData();
            req.fullUrl = `${req.protocol}://${
                this.dataExtractHostname(req) ?? "(unknown-hostname)"
            }${req.originalUrl}`;
            console.trace(
                req.hint,
                `(${req.ips.join("-")}) [${req.method}] ${req.fullUrl}`
            );
            res.set("X-Request-ID", req.hint.toString());
            if (headerXAppVersion !== undefined) {
                res.set("X-App-Version", headerXAppVersion);
            }
            if (headerXPoweredBy) {
                res.set("X-Powered-By", headerXPoweredBy);
            }
            if (setConnectionClose) {
                // This is a hop-by-hop header, default https lib do not provide HTTP/2
                res.set("Connection", "close");
            }
            finished(
                res,
                HttpHandlerHelper.responseFinishedEvent.bind(
                    undefined,
                    req.hint,
                    performance.now(),
                    res
                )
            );
            next();
        });
        app.use((req, res, next) => {
            if (req.headers["content-type"] === undefined) {
                switch (req.method) {
                    case "GET":
                    case "HEAD": {
                        break;
                    }
                    default: {
                        console.warn(
                            req.hint,
                            `Request does not have a content-type header, setting content-type to "%s".`,
                            kDefaultContentType
                        );
                        break;
                    }
                }
                req.headers["content-type"] = kDefaultContentType;
            }
            next();
        });
        app.use(
            Express.raw({
                inflate: false,
                limit: options?.maxSize ?? "10kb",
                type: "*/*",
            })
        );

        app.use(preRouter);
        app.use(router);
        app.use(postRouter);

        app.use((req, res, next) => {
            // 404 handler
            next(
                new HttpError(
                    404,
                    `Handler not found for "${req.fullUrl}" (${req.method}).`
                )
            );
        });
        app.use(
            (
                err: Error,
                req: Express.Request,
                res: Express.Response,
                next: Express.NextFunction
            ) => {
                void next;
                this.dataErrorHandler(err, req, res);
            }
        );
    }

    errorHandler(
        err: Error | HttpError,
        req: Express.Request,
        res: Express.Response
    ) {
        if (err instanceof HttpError) {
            console.error(
                req.hint,
                `HttpError (code: ${err.code}) caught in express handler.`,
                err
            );
        } else if (err instanceof ApiError) {
            console.error(
                req.hint,
                `ApiError (code: ${err.code}) caught in express handler.`,
                err
            );
        } else if (err instanceof AuthError) {
            console.error(
                req.hint,
                `AuthError (code: ${err.code}) caught in express handler.`,
                err
            );
        } else if (err instanceof RateLimitError) {
            console.error(
                req.hint,
                `RateLimitError (retryAfter: ${err.retryAfter}) caught in express handler.`,
                err
            );
        } else {
            console.error(
                req.hint,
                `Error (generic) caught in express handler.`,
                err
            );
        }

        if (res.headersSent) {
            console.warn(
                req.hint,
                `Headers already sent, skip default error page.`
            );
            res.end();
            return;
        }

        // Also check req type. If type equals to JSON, response with JSON error instead of HTTP error.
        if (err instanceof HttpError) {
            res.status(err.code)
                .set("Content-Type", "text/html; charset=utf-8")
                .send(
                    `HTTP ${err.code}. We are unable to process your request. Request-ID: "${req.hint}".`
                );
            return;
        } else if (err instanceof ApiError) {
            res.status(err.code).json({
                hint: req.hint,
                message: "We are unable to process your request at the moment.",
            });
            return;
        } else if (err instanceof AuthError) {
            res.status(err.code)
                .set("Content-Type", "text/html; charset=utf-8")
                .send(
                    `HTTP ${err.code}. We are unable to authenticate your identity. Request-ID: "${req.hint}".`
                );
            return;
        } else if (err instanceof RateLimitError) {
            const retryAfter = err.retryAfter.toFixed(0);
            res.status(429)
                .set("Retry-After", retryAfter)
                .json({
                    hint: req.hint,
                    message: `Too many requests, please retry after "${retryAfter}" seconds.`,
                });
            return;
        }

        res.status(500)
            .set("Content-Type", "text/html; charset=utf-8")
            .send(`An unexpected error occurred. Request-ID: "${req.hint}".`);
        return;
    }

    error(fn: Function) {
        this.dataErrorHandler = fn;
    }

    use(
        ...args:
            | [IHttpServerRouter]
            | [string, IHttpServerRouter]
            | [string, IHttpServerRouter, IHttpServerOptions]
    ) {
        let options: IHttpServerOptions = {};
        let path;
        let router;
        switch (args.length) {
            case 1:
                [router] = args;
                break;
            case 2:
                [path, router] = args;
                break;
            case 3:
                [path, router, options] = args;
                break;
        }
        let routingRouter;
        if (router instanceof HttpRouter) {
            routingRouter = router.router();
        } else if (CommonUtils.isFunction(router)) {
            routingRouter = router;
        } else if (CommonUtils.isAsyncFunction(router)) {
            routingRouter = router;
        }
        if (routingRouter === undefined) {
            throw new Error(
                `Argument 2 must be an instanceof HttpRouter, a Function or an AsyncFunction.`
            );
        }
        const { caseSensitive, vhosts, routing } = options;
        switch (routing) {
            case "pre":
            case "post":
            case undefined:
                break;
            default:
                throw new Error(`Invalid router sequence.`);
        }
        let bindRouter = this.dataRouter;
        switch (routing) {
            case "pre":
                bindRouter = this.dataPreRouter;
                break;
            case "post":
                bindRouter = this.dataPostRouter;
                break;
        }
        let compareFn = CommonUtils.stringEqualsIgnoreCase;
        if (caseSensitive === true) {
            compareFn = (str1: string, str2: string) => str1 === str2;
        }
        const middleware = HttpServer.vhosts(vhosts, compareFn, routingRouter, {
            extractHostname: this.dataExtractHostname,
        });
        if (path !== undefined) {
            bindRouter.use(path, middleware);
        } else {
            bindRouter.use(middleware);
        }
    }

    engine = this.dataApp.engine.bind(this.dataApp);

    set = this.dataApp.set.bind(this.dataApp);

    static vhosts(
        match: Array<{ hostname: string; protocol: string }> | undefined,
        compareFn: (request: string, match: string) => boolean,
        router: Express.Router | RequestHandler,
        options: {
            extractHostname: (req: Express.Request) => string | undefined;
        }
    ) {
        return function vhosts(
            req: Express.Request,
            res: Express.Response,
            next: Express.NextFunction
        ) {
            let hostMatched: boolean = true;
            const { extractHostname } = options;
            if (match) {
                hostMatched = false;

                for (const { hostname, protocol } of match) {
                    const protocolMatch = compareFn(req.protocol, protocol);
                    if (!protocolMatch) {
                        continue;
                    }

                    const maybeRequestHostname = extractHostname(req);
                    if (maybeRequestHostname === undefined) {
                        continue;
                    }

                    const hostnameMatch = compareFn(
                        maybeRequestHostname,
                        hostname
                    );
                    if (!hostnameMatch) {
                        continue;
                    }

                    hostMatched = true;
                    break;
                }
            }
            if (!hostMatched) {
                next();
                return;
            }
            router(req, res, next);
        };
    }
}

export type HttpHandlerReq = Express.Request;
export type HttpHandlerRes = Express.Response;
export type HttpHandlerNext = Express.NextFunction;
