import Bootstrap from "./modules/Bootstrap";
new Bootstrap(__dirname).install();
import process from "process";
import fs from "fs";

import {
    HttpServer,
    HttpRouter,
    HttpHandlerReq,
    HttpHandlerRes,
    HttpHandlerNext,
    THttpServerConstructorOptionsTls,
} from "./modules/HttpHandler";

import EnvParser from "./modules/EnvParser";
import Logger, { assertLevel } from "./modules/Logger";
import AppInfo from "./modules/AppInfo";
import CommonUtils from "./modules/CommonUtils";

const envParser = new EnvParser({
    prefix: "NET_FOMOPAY_EXAMPLE_",
});

const ENV_DEBUG = envParser.parse(
    "DEBUG",
    process.env.NODE_ENV !== "production",
    "boolean"
);
const ENV_HOST = envParser.parse("HOST", "0.0.0.0");
const ENV_PORT = envParser.parse("PORT", 8080, "integer");
const ENV_HTTP_HOSTNAME = envParser.parse("HTTP_HOSTNAME", "127.0.0.1");
const ENV_HTTP_PORT = envParser.parse("HTTP_PORT", ENV_PORT, "integer");
const ENV_HTTP_TLS_KEY_FILE = envParser.parse("HTTP_TLS_KEY_FILE", "");
const ENV_HTTP_TLS_CERT_FILE = envParser.parse("HTTP_TLS_CERT_FILE", "");
const ENV_HTTP_TLS_DHPARAM_FILE = envParser.parse("HTTP_TLS_DHPARAM_FILE", "");
const ENV_HTTP_HEALTHCHECK_PATH = envParser.parse(
    "HTTP_HEALTHCHECK_PATH",
    "/healthcheck"
);
const ENV_HTTP_HEALTHCHECK_STATUSCODE = envParser.parse(
    "HTTP_HEATHCHECK_STATUSCODE",
    200,
    "number"
);
const ENV_HTTP_HEALTHCHECK_BODY = envParser.parse(
    "HTTP_HEALTHCHECK_BODY",
    "OK"
);
const ENV_HTTP_TLS_ENABLED =
    ENV_HTTP_TLS_KEY_FILE !== "" ||
    ENV_HTTP_TLS_CERT_FILE !== "" ||
    ENV_HTTP_TLS_DHPARAM_FILE !== "";
const ENV_HTTP_PROTOCOL = envParser.parse(
    "HTTP_PROTOCOL",
    ENV_HTTP_TLS_ENABLED ? "https" : "http"
);
const ENV_HANDLER_PATH = envParser.parse("HANDLER_PATH", "/");
const ENV_MACHINE = envParser.parse("MACHINE", "00");
const ENV_LOGGER_APPENDERS = envParser.parse(
    "LOGGER_APPENDERS",
    ENV_DEBUG ? [] : ["gelf://graylog.fomopay.net:12201"],
    "json"
);
const ENV_LOGGER_LEVEL = envParser.parse("LOGGER_LEVEL", "all");
const ENV_LOGGER_VERBOSE = envParser.parse("LOGGER_VERBOSE", true, "boolean");

const appInfo = AppInfo.populate();

const logger = new Logger(
    CommonUtils.assertArray(ENV_LOGGER_APPENDERS).map((appender) =>
        CommonUtils.assertString(appender)
    ),
    {
        verbose: ENV_LOGGER_VERBOSE,
        level: assertLevel(ENV_LOGGER_LEVEL),
        hostname: ENV_HTTP_HOSTNAME,
        instanceId: ENV_MACHINE === "" ? undefined : ENV_MACHINE,
    }
);
logger.commit = appInfo.commit;
logger.replaceConsole();

const httpServerTls: THttpServerConstructorOptionsTls | undefined =
    ENV_HTTP_TLS_ENABLED
        ? {
              key: fs.readFileSync(ENV_HTTP_TLS_KEY_FILE),
              cert: fs.readFileSync(ENV_HTTP_TLS_CERT_FILE),
              dhparam: fs.readFileSync(ENV_HTTP_TLS_DHPARAM_FILE),
          }
        : undefined;

const httpServer = new HttpServer({
    listenPort: ENV_PORT,
    listenHost: ENV_HOST,
    tls: httpServerTls,
    healthcheck: {
        path: ENV_HTTP_HEALTHCHECK_PATH,
        statusCode: ENV_HTTP_HEALTHCHECK_STATUSCODE,
        body: ENV_HTTP_HEALTHCHECK_BODY,
    },
    options: {
        headers: {
            "x-app-version": `${appInfo.version} (${appInfo.shortCommit})`,
        },
    },
});

const httpHandler = new HttpRouter({
    appInfo: appInfo,
});
httpHandler.use(function middleware(
    req: HttpHandlerReq,
    res: HttpHandlerRes,
    next: HttpHandlerNext
) {
    next();
});
httpHandler.run([{ path: "/", handler: require("./handlers") }]);

httpServer.use(ENV_HANDLER_PATH, httpHandler, {
    vhosts: [{ hostname: ENV_HTTP_HOSTNAME, protocol: ENV_HTTP_PROTOCOL }],
});

process.on("uncaughtException", (err) => {
    console.error("uncaughtException", err);
});
process.on("unhandledRejection", (reason, p) => {
    console.error("unhandledRejection", reason, p);
});
