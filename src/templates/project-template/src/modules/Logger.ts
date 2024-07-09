import util from "util";
import path from "path";
import os from "os";
import log4js, {
    Appender,
    AppenderModule,
    CustomAppender,
    DateFileAppender,
} from "log4js";
import { URLSearchParams } from "url";
import CommonUtils from "./CommonUtils";
import { HttpRequestId } from "./HttpHandler";

const kContextArgs = "ContextArgs";
const kContextCallStack = "ContextCallStack";

// From Log4js source code
const stackReg = /^(?:\s*)at (?:(.+) \()?(?:([^(]+?):(\d+):(\d+))\)?$/;
const baseCallStackSkip = 1;
const defaultErrorCallStackSkip = 1;

/**
 * ELevel
 * `ALL` < `TRACE` < `DEBUG` < `INFO` < `WARN` < `ERROR` < `FATAL` < `MARK` < `OFF`
 */
export enum ELevel {
    ALL = "all",
    TRACE = "trace",
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    FATAL = "fatal",
    MARK = "mark",
    OFF = "off",
}

export function assertLevel(level: string): ELevel {
    const lLevel = level.toLowerCase();
    switch (lLevel) {
        case ELevel.ALL:
        case ELevel.TRACE:
        case ELevel.DEBUG:
        case ELevel.INFO:
        case ELevel.WARN:
        case ELevel.ERROR:
        case ELevel.FATAL:
        case ELevel.MARK:
        case ELevel.OFF:
            return lLevel;
    }
    throw new Error(`Unrecognized log level "${level}".`);
}

export function compareLevel(level1: ELevel, level2: ELevel): -1 | 0 | 1 {
    switch (level1) {
        case ELevel.ALL: {
            switch (level2) {
                case ELevel.ALL: {
                    return 0;
                }
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.TRACE: {
            switch (level2) {
                case ELevel.ALL: {
                    return 1;
                }
                case ELevel.TRACE: {
                    return 0;
                }
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.DEBUG: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE: {
                    return 1;
                }
                case ELevel.DEBUG: {
                    return 0;
                }
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.INFO: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG: {
                    return 1;
                }
                case ELevel.INFO: {
                    return 0;
                }
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.WARN: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO: {
                    return 1;
                }
                case ELevel.WARN: {
                    return 0;
                }
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.ERROR: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN: {
                    return 1;
                }
                case ELevel.ERROR: {
                    return 0;
                }
                case ELevel.FATAL:
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.FATAL: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR: {
                    return 1;
                }
                case ELevel.FATAL: {
                    return 0;
                }
                case ELevel.MARK:
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.MARK: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL: {
                    return 1;
                }
                case ELevel.MARK: {
                    return 0;
                }
                case ELevel.OFF: {
                    return -1;
                }
            }
        }
        case ELevel.OFF: {
            switch (level2) {
                case ELevel.ALL:
                case ELevel.TRACE:
                case ELevel.DEBUG:
                case ELevel.INFO:
                case ELevel.WARN:
                case ELevel.ERROR:
                case ELevel.FATAL:
                case ELevel.MARK: {
                    return 1;
                }
                case ELevel.OFF: {
                    return 0;
                }
            }
        }
    }
}

type TParsedError = {
    fileName: string;
    lineNumber: number;
    columnNumber: number;
    callStack: string;
    className: string;
    functionName: string;
    functionAlias: string;
    callerName: string;
};

function parseError(
    data: Error,
    commit: string | undefined,
    skipIdx = defaultErrorCallStackSkip + baseCallStackSkip
): TParsedError | undefined {
    try {
        const stacklines = data.stack?.split("\n").slice(skipIdx);
        if (!stacklines?.length) {
            return undefined;
        }
        const lineMatch = stackReg.exec(stacklines[0]);
        if (!lineMatch || lineMatch.length !== 5) {
            return undefined;
        }
        // extract class, function and alias names
        let className = "";
        let functionName = "";
        let functionAlias = "";
        if (lineMatch[1] && lineMatch[1] !== "") {
            // WARN: this will unset alias if alias is not present.
            [functionName, functionAlias] = lineMatch[1]
                .replace(/[[\]]/g, "")
                .split(" as ");
            functionAlias = functionAlias || "";

            if (functionName.includes("."))
                [className, functionName] = functionName.split(".");
        }

        if (commit !== undefined) {
            stacklines.push(`    at <Commit ${commit}>`);
        }

        return {
            fileName: lineMatch[2],
            lineNumber: parseInt(lineMatch[3], 10),
            columnNumber: parseInt(lineMatch[4], 10),
            callStack: stacklines.join("\n"),
            className,
            functionName,
            functionAlias,
            callerName: lineMatch[1] || "",
        };
    } catch (e) {
        return undefined;
    }
}

type TBaseError = { message: string; name: string; data: any };

type TEnhancedParsedError = TBaseError & TParsedError;

const consoleJSONAppenderModule: AppenderModule = {
    configure: (config, layouts, findAppender, levels) => {
        const consoleLog = console.log;

        const hostname = config.hostname;
        const facility = config.facility;
        const instanceId = config.instanceId;

        return (loggingEvent) => {
            const args = [...loggingEvent.context[kContextArgs]];

            let hint: HttpRequestId | undefined,
                errors: (TBaseError | TEnhancedParsedError)[] = [],
                message: string | undefined;

            const maybeHint = args[0];
            if (maybeHint instanceof HttpRequestId) {
                hint = maybeHint;
                args.shift();
            }

            for (let i = 0; i < args.length; i++) {
                const maybeError = args[i];
                if (maybeError instanceof Error) {
                    args.splice(i, 1, `$.errors[${errors.length}]`);
                    const data = Object.assign({}, maybeError);
                    const isCircular = util.format("%j", data) === "[Circular]";
                    errors.push({
                        message: maybeError.message,
                        name: maybeError.name,
                        data: isCircular ? util.inspect(data) : data,
                        ...parseError(maybeError, undefined, 1),
                    });
                }
            }

            if (args.length > 0) {
                message = util.format(...(args as [any, ...any[]]));
            }

            consoleLog(
                util.format("%j", {
                    severity: loggingEvent.level.levelStr,
                    hint: hint,
                    hostname: hostname,
                    facility: facility,
                    message: message,
                    instance: instanceId,
                    caller: loggingEvent.context[kContextCallStack],
                    errors: errors,
                })
            );
        };
    },
};

type TCreateAppenderFromConfigOptions = {
    hostname: string;
    facility: string;
    instanceId: string | undefined;
};

function createAppenderFromConfig(
    config: string,
    options: TCreateAppenderFromConfigOptions
): Appender | undefined {
    const execResult = /^([a-z]+):\/\/(.+)$/.exec(config);
    if (execResult === null) {
        throw new Error(`Invalid appender configuration: "${config}".`);
    }
    const [, type, configuration] = execResult;
    switch (type) {
        case "console": {
            switch (configuration) {
                case "json": {
                    return {
                        type: consoleJSONAppenderModule,
                        hostname: options.hostname,
                        facility: options.facility,
                        instanceId: options.instanceId,
                    };
                }
                case "none": {
                    return undefined;
                }
                case "plain":
                default: {
                    return {
                        type: "console",
                    };
                }
            }
        }
        case "gelf": {
            const configurationExec = /^(.+):(\d+)$/.exec(configuration);
            CommonUtils.assert(
                configurationExec !== null,
                `Invalid configuration for gelf: "%s".`,
                config
            );
            const [, host, port] = configurationExec;
            const nPort = CommonUtils.parseIntSafe(port);
            CommonUtils.assert(
                nPort >= 0 && nPort <= 65535,
                `Invalid port for gelf: "%s".`,
                config
            );
            const appender: CustomAppender = {
                type: "@log4js-node/gelf",
                host: host,
                port: port,
                hostname: options.hostname,
                facility: options.facility,
            };
            return appender;
        }
        case "file": {
            const absolutePath = configuration.startsWith("!");
            const nConfiguration = configuration.indexOf("?");
            const hasConfiguration = nConfiguration !== -1;
            const fullPathWithoutConfiguration = hasConfiguration
                ? configuration.slice(0, nConfiguration)
                : configuration;
            const fullPath = absolutePath
                ? fullPathWithoutConfiguration.slice(1)
                : path.resolve(
                      fullPathWithoutConfiguration,
                      options.instanceId === undefined
                          ? `${options.hostname}.log`
                          : `${options.hostname}#${options.instanceId}.log`
                  );
            let numBackups: number = 14;
            if (hasConfiguration) {
                const result = new URLSearchParams(
                    configuration.slice(nConfiguration + 1)
                );
                if (result.has("numBackups")) {
                    numBackups = CommonUtils.parseIntSafe(
                        CommonUtils.mandatory(result.get("numBackups"))
                    );
                    CommonUtils.assert(
                        numBackups > 0 && numBackups <= 180,
                        `Option numBackups must within 1-180 but "%d" provided.`,
                        numBackups
                    );
                } else if (result.has("daysToKeep")) {
                    console.warn(
                        "Deprecated: Use numBackups instead of daysToKeep."
                    );
                    numBackups = CommonUtils.parseIntSafe(
                        CommonUtils.mandatory(result.get("daysToKeep"))
                    );
                    CommonUtils.assert(
                        numBackups > 0 && numBackups <= 180,
                        `Option daysToKeep must within 1-180 but "%d" provided.`,
                        numBackups
                    );
                }
            }
            const appender: DateFileAppender = {
                type: "dateFile",
                filename: fullPath,
                keepFileExt: true,
                pattern: "yyyy-MM-dd",
                numBackups: numBackups,
                layout: { type: "basic" },
            };
            return appender;
        }
        default:
            throw new Error(`Unsupported appender configuration: "${config}".`);
    }
}

function formatMessage(args: readonly any[], instanceId?: string): string {
    let hint = "[console]";
    if (args[0] instanceof HttpRequestId) {
        hint = `[${args[0].toString()}]`;
        args = args.slice(1);
    }
    const message = [hint];
    if (instanceId !== undefined) {
        message.push("#" + instanceId);
    }
    if (args.length > 0) {
        message.push(util.format(...(args as [any, ...any[]])));
    }
    return message.join(" ");
}

export type TLoggerConstructorOptions = {
    instanceId?: string;
    verbose?: boolean;
    facility?: string;
    hostname?: string;
    level?: ELevel;
};

export default class Logger {
    private optHostname: string;
    private optCommit?: string;
    private optInstanceId?: string;
    private optLevel: ELevel;
    private optVerbose: boolean;
    private optFacility: string;

    /**
     * Create a Logger
     * (Please note you can provide same type of appender multiple times. e.g. write to two different log files.)
     * @param {readonly string[]} appenderConfigurations - See below
     * @param {string?} options.hostname - (Optional) Hostname of the instance, default to `os.hostname()` if not provided
     * @param {boolean?} options.verbose - (Optional) Records logger caller stack trace
     * @param {string?} options.facility - (Optional) Facility of the instance
     * @param {string?} options.instanceId - (Optional) Indicates the instance ID if multiple instances are running
     * @param {ELevel?} options.level - (Optional) Minimum log level to print (inclusive), default to `ELevel.ALL` if not provided
     *
     * `appenderConfigurations` is a list of appender configuration in string array. Currently support the two appenders below:
     * * **gelf**
     * > Log to remote Graylog server
     * > * `gelf://hostname:port`
     * * **file**
     * > Log to local disk, logs will be automatically rotated with ".yyyy-MM-dd" before extension.
     * > * Specifying path: `file://directory/containing/the/file`
     * >   - Generate logs files in directory `directory/containing/the/file`.
     * >   - File name will be automatically generated as below
     * >     * `directory/containing/the/file/hostname.log` (without instance ID)
     * >     * `directory/containing/the/file/hostname.2020-02-02.log` (without instance ID, rotated)
     * >     * `directory/containing/the/file/hostname.#instanceId.log` (with instance ID)
     * >     * `directory/containing/the/file/hostname.#instanceId.2020-02-02.log` (without instance ID, rotated)
     * > * Specifying file: `file://!path/to/log/file.txt`
     * >   - Use exact the given path and file name
     * >     * `path/to/log/file.txt`
     * >     * `path/to/log/file.2020-02-02.txt` (rotated)
     */
    constructor(
        appenderConfigurations: readonly string[],
        options?: TLoggerConstructorOptions
    ) {
        this.optHostname = options?.hostname ?? os.hostname();
        this.optLevel = options?.level ?? ELevel.ALL;
        this.optVerbose = options?.verbose ?? false;
        this.optFacility = options?.facility ?? "app";
        this.optInstanceId = options?.instanceId;

        const mutableAppenderConfigurations = [...appenderConfigurations];

        if (mutableAppenderConfigurations.length === 0) {
            console.warn("No appenders provided, using console://plain");
            mutableAppenderConfigurations.push("console://plain");
        }

        const appenderConfig: TCreateAppenderFromConfigOptions = {
            hostname: this.optHostname,
            facility: this.optFacility,
            instanceId: this.optInstanceId,
        };

        const appenderMap = mutableAppenderConfigurations.reduce<{
            [key: string]: Appender;
        }>((appenders, configuration, i) => {
            const key = `appender-${i.toFixed(0)}`;
            const appender = createAppenderFromConfig(
                configuration,
                appenderConfig
            );
            if (appender !== undefined) {
                appenders[key] = appender;
            }
            return appenders;
        }, {});

        const appenders = Object.keys(appenderMap);

        if (appenders.length === 0) {
            return;
        }

        log4js.configure({
            appenders: appenderMap,
            categories: {
                default: {
                    level: ELevel.ALL, // We do not control log level using log4js
                    appenders: appenders,
                },
            },
        });
    }

    set commit(val: string | undefined) {
        this.optCommit = val;
    }

    get commit(): string | undefined {
        return this.optCommit;
    }

    replaceConsole(): void {
        console.trace = this.trace.bind(this);
        console.debug = this.debug.bind(this);
        console.log = this.info.bind(this);
        console.info = this.info.bind(this);
        console.warn = this.warn.bind(this);
        console.error = this.error.bind(this);
    }

    /**
     * trace(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    trace(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.TRACE, this.optLevel) < 0) {
            return;
        }

        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.trace(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }

    /**
     * debug(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    debug(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.DEBUG, this.optLevel) < 0) {
            return;
        }

        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.debug(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }

    /**
     * info(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    info(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.INFO, this.optLevel) < 0) {
            return;
        }

        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.info(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }

    /**
     * warn(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    warn(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.WARN, this.optLevel) < 0) {
            return;
        }

        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.warn(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }

    /**
     * error(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    error(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.ERROR, this.optLevel) < 0) {
            return;
        }
        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.error(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }

    /**
     * fatal(`[hint]`, `msg1`, `msg2`, `...`, `[error]`);
     * @param {any} message
     * @param {...any} args
     */
    fatal(message: any, ...args: any[]): void {
        if (compareLevel(ELevel.FATAL, this.optLevel) < 0) {
            return;
        }
        const instanceId = this.optInstanceId;
        const commit = this.optCommit;
        const verbose = this.optVerbose;

        const stack = verbose ? parseError(new Error(), commit) : undefined;
        const fullArgs = [message, ...args];

        const logger = log4js.getLogger();
        logger.addContext(kContextArgs, fullArgs);
        logger.addContext(kContextCallStack, stack);
        logger.fatal(
            formatMessage(fullArgs, instanceId) +
                (stack === undefined ? "" : "\nLog:\n" + stack.callStack)
        );
    }
}
