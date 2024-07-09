import crypto from "crypto";
import { types, format } from "util";

const EPSILON = 0.0001;
const BASE32MAP = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford's Base32

export class HttpError extends Error {
    code: number;

    constructor(code: number, message: string) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        this.code = code;
    }
}

export class AuthError extends Error {
    code: number;

    constructor(code: number, message: string) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        this.code = code;
    }
}

export class ApiError extends Error {
    code: number;

    constructor(code: number, message: string) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        this.code = code;
    }
}

export class RateLimitError extends Error {
    retryAfter: number;

    constructor(retryAfter: number) {
        if (arguments.length !== 1) {
            throw new Error(
                `RateLimitError requires exact 1 arguments, but ${arguments.length} provided.`
            );
        }
        super("Too many requests.");

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        this.retryAfter = retryAfter;
    }
}

export default class CommonUtils {
    static isFunction(f: any): boolean {
        return typeof f === "function";
    }

    static isBoolean(b: any): b is boolean {
        return typeof b === "boolean";
    }

    static isNumber(num: any): num is number {
        return typeof num === "number";
    }

    static isDate(d: any): d is Date {
        return types.isDate(d);
    }

    static isSafeInteger(num: number): num is number {
        return Number.isSafeInteger(num);
    }

    static parseIntSafe(num: string): number {
        CommonUtils.assert(
            /^[+-]?\d+$/.test(num),
            "Assertion failed: Provided string contains invalid symbol(s) or non-alphanumeric character(s)."
        );
        const value = parseInt(num, 10);
        CommonUtils.assert(
            CommonUtils.isSafeInteger(value),
            "Assertion failed: Provided string %s cannot be converted to a safe integer.",
            num
        );
        return value;
    }

    static isObject(obj: any, strict?: boolean): obj is Object {
        if (obj === null || typeof obj !== "object") {
            return false;
        }
        if (strict === false) {
            return true;
        }
        return obj instanceof Object;
    }

    static isArray(arr: any): arr is Array<unknown> {
        return Array.isArray(arr);
    }

    static isBuffer(b: any): b is Buffer {
        return Buffer.isBuffer(b);
    }

    static isSymbol(s: any): s is symbol {
        return typeof s === "symbol";
    }

    static isString(str: any): str is string {
        return typeof str === "string";
    }

    static isAsyncFunction(a: any) {
        return types.isAsyncFunction(a);
    }

    static isSet(s: any): s is Set<unknown> {
        return types.isSet(s);
    }

    static assert(c: boolean, m: string, ...args: any[]): asserts c {
        if (!c) {
            throw new Error(format(m, ...args));
        }
    }

    static assertObjectHasKeys<T extends string>(
        o: any,
        keys: T[]
    ): { [key in T]: unknown } {
        if (!CommonUtils.isObject(o, false)) {
            throw new Error(
                `Assertion failed: object "${Object.prototype.toString.call(
                    o
                )}" does not belong to Object type.`
            );
        }
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(o, key)) {
                throw new Error(
                    `Assertion failed: object does not have property "${key}".`
                );
            }
        }
        return o;
    }

    static cloneObjectWithKeys<T extends string>(
        o: any,
        keys: T[]
    ): { [key in T]: unknown } {
        if (!CommonUtils.isObject(o, false)) {
            throw new Error(
                `Assertion failed: object "${Object.prototype.toString.call(
                    o
                )}" does not belong to Object type.`
            );
        }
        const dict = Object.create(null);
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(o, key)) {
                dict[key] = o[key];
            } else {
                dict[key] = undefined;
            }
        }
        return dict;
    }

    static assertDate(d: any): Date {
        if (!CommonUtils.isDate(d)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    d
                )}" is not date.`
            );
        }
        if (!CommonUtils.isValidDate(d)) {
            throw new Error(
                `Assertion failed: Date "${d.toString()}" is invalid.`
            );
        }
        return d;
    }

    static assertString(s: any): string {
        if (!CommonUtils.isString(s)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    s
                )}" is not string.`
            );
        }
        return s;
    }

    static assertOptionalString(s: any): string | undefined {
        if (s === undefined) {
            return undefined;
        }
        return CommonUtils.assertString(s);
    }

    static assertNullableString(s: any): string | undefined {
        if (s === null) {
            return undefined;
        }
        return CommonUtils.assertString(s);
    }

    static assertOptionalBoolean(b: any): boolean | undefined {
        if (b === undefined) {
            return undefined;
        }
        return CommonUtils.assertBoolean(b);
    }

    static assertNullableBoolean(b: any): boolean | undefined {
        if (b === null) {
            return undefined;
        }
        return CommonUtils.assertBoolean(b);
    }

    static assertOptionalDate(d: any): Date | undefined {
        if (d === undefined) {
            return undefined;
        }
        return CommonUtils.assertDate(d);
    }

    static assertNullableDate(d: any): Date | undefined {
        if (d === null) {
            return undefined;
        }
        return CommonUtils.assertDate(d);
    }

    static assertBuffer(b: any): Buffer {
        if (!CommonUtils.isBuffer(b)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    b
                )}" is not buffer.`
            );
        }
        return b;
    }

    static assertBoolean(b: any): boolean {
        if (!CommonUtils.isBoolean(b)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    b
                )}" is not boolean.`
            );
        }
        return b;
    }

    static assertSafeInteger(i: any): number {
        if (!CommonUtils.isNumber(i)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    i
                )}" is not number.`
            );
        }
        if (!CommonUtils.isSafeInteger(i)) {
            throw new Error(
                `Assertion failed: Number "${i}" is not a safe integer.`
            );
        }
        return i;
    }

    static assertArray(a: any): unknown[] {
        if (!CommonUtils.isArray(a)) {
            throw new Error(
                `Assertion failed: Data type "${Object.prototype.toString.call(
                    a
                )}" is not array.`
            );
        }
        return a;
    }

    static objectHasKey(obj: object, key: string | symbol): boolean {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    static arrayUnique<T>(arr: T[]): boolean {
        return arr.length === new Set(arr).size;
    }

    static numberCompare(
        num1: number,
        num2: number,
        epsilon?: number
    ): -1 | 0 | 1 {
        // 0, 1, -1 are all safe integers (Number.isSafeInteger(i) === true)
        epsilon = epsilon ?? EPSILON;
        const diff = num1 - num2;
        if (Math.abs(diff) < epsilon) {
            return 0;
        }
        if (diff < 0) {
            return -1;
        }
        return 1;
    }

    static stringEqualsIgnoreCase(str1: string, str2: string): boolean {
        return (
            str1.length === str2.length &&
            str1.toUpperCase() === str2.toUpperCase()
        );
    }

    static stringStartsWithIgnoreCase(str: string, needle: string): boolean {
        return (
            needle.length <= str.length &&
            needle === str.slice(0, needle.length)
        );
    }

    static createAESKey(
        password: string | Buffer,
        blocksize: 128 | 160 | 192 | 224 | 256
    ): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            crypto.pbkdf2(
                password,
                "",
                10000,
                blocksize / 8,
                "sha256",
                (err, key) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(key);
                }
            );
        });
    }

    static createAESKeySync(
        password: string | Buffer,
        blocksize: 128 | 160 | 192 | 224 | 256
    ) {
        return crypto.pbkdf2Sync(password, "", 10000, blocksize / 8, "sha256");
    }

    static createAESIv(): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(buf);
            });
        });
    }

    static generateRandomId(): string {
        return crypto.randomBytes(16).toString("hex");
    }

    static generateShortId(): string {
        return crypto
            .randomBytes(7)
            .map((value) => BASE32MAP.charCodeAt(value & 31))
            .toString();
    }

    static setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a, ...b]);
    }

    static setIntersection<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a].filter((x) => b.has(x)));
    }

    static setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a].filter((x) => !b.has(x)));
    }

    static setEqual<T>(a: Set<T>, b: Set<T>): boolean {
        if (a.size !== b.size) {
            return false;
        }
        for (const ai of a) {
            if (!b.has(ai)) {
                return false;
            }
        }
        return true;
    }

    static isValidDate(d: Date): boolean {
        return !isNaN(d.getTime());
    }

    static waitForNextEventLoop(): Promise<void> {
        return new Promise<void>((resolve) => setImmediate(resolve));
    }

    static mandatory<T>(value: T | null | undefined): T {
        if (value === null) {
            throw new Error("Mandatory value values null.");
        } else if (value === undefined) {
            throw new Error("Mandatory value values undefined.");
        }
        return value;
    }
}
