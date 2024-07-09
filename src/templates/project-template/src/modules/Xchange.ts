import { URL } from "url";
import crypto from "crypto";
import { FetchError } from "node-fetch";
import CommonUtils from "./CommonUtils";
import Request from "./Request";
import NonceController from "./NonceController";

const kXAuthenticationVersion = "1";
const kXAuthenticationMethod = "SHA256WithRSA";

export enum ERoundingMode {
    Up = "up",
    Down = "down",
    HalfUp = "half-up",
    HalfDown = "half-down",
    HalfEven = "half-even",
}

export type TXchangeConstructorOptions = {
    baseUrl: string;
    privateKey: string;
    publicKey: string;
    service: string;
    nonceController: NonceController;
};

export type TXchangeNormalizeOptions = {
    minimumCurrencyUnit?: boolean;
    amount: string;
    currency: string; // 3 uppercase alphabetic code
    rounding?: ERoundingMode;
};

export type TXchangeNormalizeResult = {
    amount: string;
    currency: string;
    minor: number;
};

export type TXchangeConvertOptionsWithoutAmount = {
    source: string; // 3 uppercase alphabetic code
    target: string; // 3 uppercase alphabetic code
    timestamp: number; // Unix timestmap in seconds
};

export type TXchangeConvertOptionsWithAmount = {
    source: string; // 3 uppercase alphabetic code
    target: string; // 3 uppercase alphabetic code
    timestamp: number; // Unix timestmap in seconds
    amount: string;
    rounding: ERoundingMode;
    minimumCurrencyUnit?: boolean;
};

export type TXchangeConvertReturnWithoutAmount = {
    timestamp: number;
    quote: number;
    minor: number;
};

export type TXchangeConvertReturnWithAmount = {
    timestamp: number;
    quote: number;
    minor: number;
    amount: string;
};

export type TXchangeConvertOptions =
    | TXchangeConvertOptionsWithoutAmount
    | TXchangeConvertOptionsWithAmount;

export type TXchangeConvertReturn =
    | TXchangeConvertReturnWithoutAmount
    | TXchangeConvertReturnWithAmount;

export default class Xchange {
    private optPrivateKey: string;
    private optPublicKey: string;
    private optService: string;
    private optNonceController: NonceController;

    private dataUrlNormalize: URL;
    private dataUrlConvert: URL;

    /**
     * Create an Xchange instance.
     * @param options.baseUrl - Base URL for Xchange system.
     * @param options.service - Service name registered in Xchange system.
     * @param options.privateKey - Private key of corresponding service.
     * @param options.publicKey - Public key of corresponding service.
     * @param options.nonceController - An instance of NonceController.
     */
    constructor(options: TXchangeConstructorOptions) {
        this.optPrivateKey = options.privateKey;
        this.optPublicKey = options.publicKey;
        this.optService = options.service;
        this.optNonceController = options.nonceController;

        this.dataUrlNormalize = new URL("normalize", options.baseUrl);
        this.dataUrlConvert = new URL("convert", options.baseUrl);
    }

    private async request(url: URL, json: object) {
        const privateKey = this.optPrivateKey;
        const service = this.optService;
        const publicKey = this.optPublicKey;
        const nonceController = this.optNonceController;

        const reqBody = JSON.stringify(json);
        const reqNonce = CommonUtils.generateRandomId();
        const reqTimestamp = (Date.now() / 1000).toFixed(0);
        const cSign = crypto.createSign("RSA-SHA256");
        cSign.update(
            Buffer.from(
                `${reqNonce}${reqTimestamp}${reqNonce}${reqBody}${reqNonce}`
            )
        );
        const reqSign = cSign.sign(privateKey, "hex");

        const req = new Request({
            timeout: 6000,
        });
        const res = await req.fetch(url, {
            method: "POST",
            body: reqBody,
            headers: {
                "X-Authentication-Version": "1",
                "X-Authentication-Method": "SHA256WithRSA",
                "X-Authentication-Sign": reqSign,
                "X-Authentication-Nonce": reqNonce,
                "X-Authentication-Timestamp": reqTimestamp,
                "X-Authentication-Service": service,
                "Content-Type": "application/json",
            },
        });

        CommonUtils.assert(
            res.status === 200,
            `Response HTTP status code "%d" does not equal to 200.`,
            res.status
        );
        const headers = res.headers;
        const resXAuthenticationVersion = CommonUtils.mandatory(
            headers.get("x-authentication-version")
        );
        const resContentType = CommonUtils.mandatory(
            headers.get("content-type")
        );
        const resXAuthenticationMethod = CommonUtils.mandatory(
            headers.get("x-authentication-method")
        );
        const resNonce = CommonUtils.mandatory(
            headers.get("x-authentication-nonce")
        );
        const resTimestamp = CommonUtils.mandatory(
            headers.get("x-authentication-timestamp")
        );
        const resSign = CommonUtils.mandatory(
            headers.get("x-authentication-sign")
        );

        CommonUtils.assert(
            resXAuthenticationVersion === kXAuthenticationVersion,
            `Response X-Authentication-Version "%s" is invalid.`,
            resXAuthenticationVersion
        );
        CommonUtils.assert(
            /^application\/json(; charset=utf-8)?$/.test(resContentType),
            `Response Content-Type "%s" is invalid.`,
            resContentType
        );
        CommonUtils.assert(
            resXAuthenticationMethod === kXAuthenticationMethod,
            `Response X-Authentication-Method "%s" is invalid.`,
            resXAuthenticationMethod
        );

        const timestamp = CommonUtils.parseIntSafe(resTimestamp);
        const now = Date.now() / 1000;
        CommonUtils.assert(
            Math.abs(timestamp - now) <= 300,
            `Response timestamp "%d" out of range.`,
            timestamp
        );

        const bResNonce = Buffer.from(resNonce);
        const bResTimestamp = Buffer.from(resTimestamp);

        const bResBody = await res.buffer();
        const cVerify = crypto.createVerify("RSA-SHA256");
        cVerify.write(
            Buffer.concat([
                bResNonce,
                bResTimestamp,
                bResNonce,
                bResBody,
                bResNonce,
            ])
        );
        cVerify.end();
        CommonUtils.assert(
            cVerify.verify(publicKey, resSign, "hex"),
            "Xchange response signature cannot be verified."
        );

        CommonUtils.assert(
            await nonceController.add("xchange.fomopay.net", resNonce, false),
            `Invalid or duplicate nonce.`
        );

        const resJson = JSON.parse(bResBody.toString());
        const {
            error_code: resErrorCode,
            error_message: resErrorMessage,
            result_code: resResultCode,
            result_message: resResultMessage,
        } = resJson;
        CommonUtils.assert(
            resErrorCode === 0,
            `Response JSON error_code "%d" does not equal to 0. Response error_message: "%s".`,
            resErrorCode,
            resErrorMessage
        );
        CommonUtils.assert(
            resResultCode === 0,
            `Response JSON result_code "%d" does not equal to 0. Response result_message: "%s".`,
            resResultCode,
            resResultMessage
        );
        CommonUtils.assert(
            CommonUtils.isObject(resJson.data),
            `Response JSON data is not a valid object.`
        );
        return resJson.data;
    }

    private async requestWithRetry(tries: number, url: URL, json: object) {
        CommonUtils.assert(
            tries > 0,
            `Argument tries "%d" must be greater than 0.`,
            tries
        );
        for (let i = 0; i < tries; i++) {
            try {
                return await this.request(url, json);
            } catch (e) {
                if (e instanceof FetchError) {
                    switch (e.type) {
                        case "body-timeout":
                        case "request-timeout":
                            console.warn(
                                `Error (fetch) while performing xchange request to "%s" at try #%d, retrying...`,
                                url,
                                i,
                                e
                            );
                            continue;
                    }
                    const code = e.code;
                    switch (code) {
                        case "ETIMEDOUT":
                        case "ECONNRESET":
                        case "ESOCKETTIMEDOUT":
                        case "ECONNABORTED":
                        case "ECONNREFUSED":
                            console.warn(
                                `Error (system) while performing xchange request to "%s" at try #%d, retrying...`,
                                url,
                                i,
                                e
                            );
                            continue;
                    }
                }
                console.warn(
                    `Error while performing xchange request to "%s" at try #%d, giving up...`,
                    url,
                    i,
                    e
                );
                throw e;
            }
        }
        throw new Error(
            `Too many fails (${tries}) while retrying xchange request to "${url}", aborting.`
        );
    }

    /**
     * Normalize provided amount using specified currency code.
     * If `minimumCurrencyUnit` is `true`, the provided amount must not contain decimal point.
     * The amount will then be treated as minimum currency unit (such as cents) in the currency.
     * @param options.amount - Amount in major currency or amount of minimum currency units if `minimumCurrencyUnit` is `true`.
     * @param options.currency - The currency code the amount is in.
     * @param options.rounding - *(Optional)* Mode of rounding when `amount` is provided. Default to `up` (as specified in xchange service).
     * @param options.minimumCurrencyUnit - *(Optional)* Specify amount provided is in (e.g.) cents (when `true`) or dollars (when not `true`).
     */
    async normalize(
        options: TXchangeNormalizeOptions
    ): Promise<TXchangeNormalizeResult> {
        const urlNormalize = this.dataUrlNormalize;

        return await this.requestWithRetry(3, urlNormalize, options);
    }

    /**
     * Convert the provided amount from source currency code to target currency code at specified timestamp.
     * @param options.source - Source currency code.
     * @param options.target - Target currency code.
     * @param options.timestamp - Reference exchange rate at the timestamp provided.
     * @param options.amount - *(Optional)* Amount to convert. If not provided, `amount` will not exist in response.
     * @param options.rounding - *(Conditional)* Mode of rounding when `amount` is provided. Default to `up` (as specified in xchange service). Do not specify when `amount` is not provided.
     * @param options.minimumCurrencyUnit - *(Conditional,Optional)* Specify amount provided is in (e.g.) cents (when `true`) or dollars (when not `true`).
     */
    async convert(
        options: TXchangeConvertOptionsWithoutAmount
    ): Promise<TXchangeConvertReturnWithoutAmount>;
    async convert(
        options: TXchangeConvertOptionsWithAmount
    ): Promise<TXchangeConvertReturnWithAmount>;
    async convert(
        options: TXchangeConvertOptions
    ): Promise<TXchangeConvertReturn> {
        const urlConvert = this.dataUrlConvert;

        return await this.requestWithRetry(3, urlConvert, options);
    }
}
