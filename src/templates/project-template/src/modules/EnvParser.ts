import CommonUtils from "./CommonUtils";

type IValueFunction<T> = () => T;

export default class EnvParser {
    private optPrefix: string;
    private dataEnv: { [key: string]: string | undefined };

    constructor(options: { prefix: string }) {
        this.optPrefix = options.prefix;
        this.dataEnv = process.env;
    }

    parse(
        key: string,
        defaultValue: string | IValueFunction<string>,
        type?: "string"
    ): string;
    parse(
        key: string,
        defaultValue: number | IValueFunction<number>,
        type: "integer" | "number" | "float"
    ): number;
    parse(
        key: string,
        defaultValue: any | IValueFunction<any>,
        type: "json"
    ): any;
    parse(
        key: string,
        defaultValue: boolean | IValueFunction<boolean>,
        type: "boolean"
    ): boolean;
    parse(
        key: string,
        defaultValue: any | IValueFunction<any>,
        type:
            | "string"
            | "integer"
            | "number"
            | "float"
            | "json"
            | "boolean" = "string"
    ) {
        const prefix = this.optPrefix;
        const env = this.dataEnv;
        const keyFull = `${prefix}${key}`;
        const envValue = env[keyFull];
        if (!CommonUtils.isString(envValue)) {
            if (!CommonUtils.isFunction(defaultValue)) {
                return defaultValue;
            }
            return defaultValue();
        }

        switch (type) {
            case "string":
                return envValue;
            case "integer":
                return CommonUtils.parseIntSafe(envValue);
            case "number":
            case "float":
                return parseFloat(envValue);
            case "json":
                return JSON.parse(envValue);
            case "boolean": {
                switch (envValue!.toLowerCase()) {
                    case "true":
                        return true;
                    case "false":
                        return false;
                }
                throw new Error(
                    `Unexpected value "${envValue}" while parsing environment variable "${keyFull}" with type "${type}".`
                );
            }
            default:
                throw new Error(
                    `Unexpected type encountered "${type}" while parsing environment variable "${keyFull}".`
                );
        }
    }
}
