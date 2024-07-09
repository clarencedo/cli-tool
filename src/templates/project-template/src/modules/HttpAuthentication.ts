import crypto from "crypto";
import { URL } from "url";
import CommonUtils, { AuthError } from "./CommonUtils";
import MerchantConfig from "./MerchantConfig";
import NonceController from "./NonceController";
import { HttpHandlerReq, HttpHandlerRes, HttpHandlerNext } from "./HttpHandler";

const CONST_AUTHORIZATION_TYPE = "FOMOPAY1-RSA-SHA256";

const CONST_ISO8601_REGEX =
    /^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(Z)?$/;
const CONST_HTTP_HEADER_KEY_REGEX =
    /^[\x21\x23-\x27\x2a\x2b\x2d\x2e\x30-\x39\x41-\x5a\x5e-\x7a\x7c\x7e]+$/;

function fixedEncodeURIComponent(str: string) {
    // A-Z a-z 0-9 - _ . ~
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16);
    });
}

const getIso8601Time = (function () {
    function pad(number: number) {
        if (number < 10) {
            return "0" + number;
        }
        return number;
    }
    return function getIso8601Time(date: Date) {
        return (
            date.getUTCFullYear() +
            "-" +
            pad(date.getUTCMonth() + 1) +
            "-" +
            pad(date.getUTCDate()) +
            "T" +
            pad(date.getUTCHours()) +
            ":" +
            pad(date.getUTCMinutes()) +
            ":" +
            pad(date.getUTCSeconds()) +
            "Z"
        );
    };
})();

if (!Date.prototype.toISOString) {
    (function () {
        function pad(number: number) {
            if (number < 10) {
                return "0" + number;
            }
            return number;
        }

        Date.prototype.toISOString = function () {
            return (
                this.getUTCFullYear() +
                "-" +
                pad(this.getUTCMonth() + 1) +
                "-" +
                pad(this.getUTCDate()) +
                "T" +
                pad(this.getUTCHours()) +
                ":" +
                pad(this.getUTCMinutes()) +
                ":" +
                pad(this.getUTCSeconds()) +
                "." +
                (this.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) +
                "Z"
            );
        };
    })();
}

export type HttpAuthenticationPayload = {
    merchant: string;
    json: any;
    headers: {
        // Headers are signed
        [key: string]: string;
    };
};

export type HttpAuthenticationMiddlewareOptions = {
    merchantConfig: MerchantConfig;
    nonceController: NonceController;
};

export function HttpAuthenticationMiddleware(
    options: HttpAuthenticationMiddlewareOptions
) {
    const merchantConfig = options.merchantConfig;
    const nonceController = options.nonceController;

    return async function HttpAuthenticationMiddleware(
        req: HttpHandlerReq,
        res: HttpHandlerRes,
        next: HttpHandlerNext
    ) {
        try {
            const headers = req.headers;

            let authorization = undefined;

            try {
                authorization = CommonUtils.assertString(
                    headers["authorization"]
                );
            } catch (e) {
                console.warn(
                    req.hint,
                    "Authorization header found not string.",
                    e
                );
                throw new AuthError(
                    0x0001,
                    `Authorization header cannot be found.`
                );
            }

            // According to trim
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trim
            const [authorizationTypeRaw, authorizationCredentialsRaw] =
                authorization.split(/[\s\uFEFF\xA0](.+)$/, 2);

            if (
                !CommonUtils.isString(authorizationTypeRaw) ||
                !CommonUtils.isString(authorizationCredentialsRaw)
            ) {
                throw new AuthError(
                    0x0003,
                    `Unable to split authorizationType and authorizationCredentials`
                );
            }

            const authorizationType = authorizationTypeRaw.trim();
            const authorizationCredentials = authorizationCredentialsRaw.trim();

            if (authorizationType !== CONST_AUTHORIZATION_TYPE) {
                throw new AuthError(
                    0x0004,
                    `Unsupported authorization type "${authorizationType}".`
                );
            }

            const authorizationCredentialFields: {
                [key: string]: string;
            } = authorizationCredentials
                .split(",")
                .map((field) => field.split(/=(.+)$/, 2))
                .reduce((p: { [key: string]: string }, [key, value]) => {
                    if (
                        !CommonUtils.isString(key) ||
                        !CommonUtils.isString(value)
                    ) {
                        throw new AuthError(
                            0x0005,
                            `Invalid authorization credentials format at "${key}".`
                        );
                    }
                    if (key.length <= 0) {
                        throw new AuthError(
                            0x0006,
                            `Authorization credential key too short.`
                        );
                    }
                    if (CommonUtils.objectHasKey(p, key)) {
                        throw new AuthError(
                            0x0007,
                            `Duplicate authorization credential key found "${key}".`
                        );
                    }
                    p[key] = value;
                    return p;
                }, {});

            if (
                !CommonUtils.setEqual(
                    new Set(["Credential", "SignedHeaders", "Signature"]),
                    new Set(Object.keys(authorizationCredentialFields))
                )
            ) {
                throw new AuthError(
                    0x0008,
                    `Missing or unexpected credential keys.`
                );
            }

            const authorizationCredentialCredential =
                authorizationCredentialFields["Credential"];
            const authorizationCredentialSignedHeaders =
                authorizationCredentialFields["SignedHeaders"];
            const authorizationCredentialSignature =
                authorizationCredentialFields["Signature"];

            const signedHeadersRaw =
                authorizationCredentialSignedHeaders.split(";");
            const signedHeadersSet = new Set(signedHeadersRaw);
            const signedHeadersFull = new Set(signedHeadersSet);
            if (signedHeadersRaw.length !== signedHeadersSet.size) {
                throw new AuthError(
                    0x0009,
                    `Duplicate header key found in SignedHeaders.`
                );
            }

            const fullUrl = new URL(req.fullUrl);

            const queryRaw = fullUrl.searchParams;
            const httpRawHeaders = req.rawHeaders;
            const headersRaw: {
                [key: string]: string;
            } = {};
            if (httpRawHeaders.length % 2 !== 0) {
                throw new Error(
                    `httpRawHeaders (key/value pair) has an odd length.`
                );
            }
            for (let i = 0; i < httpRawHeaders.length; i += 2) {
                const key = httpRawHeaders[i].toLowerCase();
                if (!CONST_HTTP_HEADER_KEY_REGEX.test(key)) {
                    throw new AuthError(
                        0x0010,
                        `Invalid HTTP header key "${key}".`
                    );
                }
                if (!signedHeadersFull.has(key)) {
                    switch (true) {
                        case key === "host":
                        case key === "content-type":
                        case key.startsWith("x-fomopay-"):
                            throw new AuthError(
                                0x0010,
                                `Compulsory header "${httpRawHeaders[i]}" not signed.`
                            );
                    }
                    continue;
                }
                if (!signedHeadersSet.has(key)) {
                    throw new AuthError(
                        0x0010,
                        `Duplicate HTTP header "${httpRawHeaders[i]}" found.`
                    );
                }
                signedHeadersSet.delete(key);
                const value = httpRawHeaders[i + 1].trim();
                headersRaw[key] = value;
            }
            if (signedHeadersSet.size !== 0) {
                throw new AuthError(
                    0x0011,
                    `"${signedHeadersSet.size}" signed header key not found in HTTP header.`
                );
            }

            const headersSorted = Object.entries(headersRaw).sort((a, b) =>
                a[0].localeCompare(b[0])
            );

            const signedHeaders = headersSorted.map(([key]) => key).join(";");
            if (signedHeaders !== authorizationCredentialSignedHeaders) {
                throw new AuthError(
                    0x0012,
                    `SignedHeaders field in authorization credentials is not properly formatted.`
                );
            }

            let xFomopayNonce = undefined;
            try {
                xFomopayNonce = CommonUtils.assertString(
                    req.headers["x-fomopay-nonce"]
                );
            } catch (e) {
                console.warn(
                    req.hint,
                    "Authorization header found not string.",
                    e
                );
                throw new AuthError(
                    0x0013,
                    `Compulsory header x-fomopay-nonce cannot be found.`
                );
            }
            if (!/^[0-9A-Za-z]{16,256}$/.test(xFomopayNonce)) {
                throw new AuthError(
                    0x0014,
                    `Requested x-fomopay-nonce has an invalid length "${xFomopayNonce.length}" or contains non-alphanumeric characters.`
                );
            }

            const xFomopayContentSha256 =
                req.headers["x-fomopay-content-sha256"];
            if (!CommonUtils.isString(xFomopayContentSha256)) {
                throw new AuthError(
                    0x0015,
                    `Compulsory header x-fomopay-content-sha256 cannot be found.`
                );
            }
            const reqBody = CommonUtils.isBuffer(req.body)
                ? req.body
                : Buffer.alloc(0);
            const hashedPayload = crypto
                .createHash("SHA256")
                .update(reqBody)
                .digest("hex")
                .toLowerCase();
            if (xFomopayContentSha256 !== hashedPayload) {
                throw new AuthError(
                    0x0016,
                    `Requested x-fomopay-content-sha256 does not match payload hash.`
                );
            }

            try {
                xFomopayNonce = CommonUtils.assertString(
                    req.headers["x-fomopay-nonce"]
                );
            } catch (e) {
                console.warn(
                    req.hint,
                    "x-fomopay-nonce header found not string.",
                    e
                );
                throw new AuthError(
                    0x0013,
                    `Compulsory header x-fomopay-nonce cannot be found.`
                );
            }
            let xFomopayDate = undefined;
            try {
                xFomopayDate = CommonUtils.assertString(
                    req.headers["x-fomopay-date"]
                );
            } catch (e) {
                console.warn(
                    req.hint,
                    "x-fomopay-date header found not string.",
                    e
                );
                throw new AuthError(
                    0x0013,
                    `Compulsory header x-fomopay-date cannot be found.`
                );
            }
            const dateInst = new Date(xFomopayDate);
            if (isNaN(dateInst.getTime())) {
                throw new AuthError(
                    0x0014,
                    `Requested x-fomopay-date contains an invalid value.`
                );
            }
            const dateExec = CONST_ISO8601_REGEX.exec(xFomopayDate);
            if (dateExec === null || dateExec[7] === undefined) {
                if (getIso8601Time(dateInst) !== xFomopayDate) {
                    throw new AuthError(
                        0x0015,
                        `Invalid x-fomopay-date "${xFomopayDate}" format.`
                    );
                }
            } else {
                if (dateInst.toISOString() !== xFomopayDate) {
                    throw new AuthError(
                        0x0016,
                        `Invalid x-fomopay-date "${xFomopayDate}" format.`
                    );
                }
            }

            const httpVerb = req.method.toUpperCase();
            const canonicalUri = fullUrl.pathname;
            const canonicalQueryString = [...queryRaw.entries()]
                .map(([key, value]) => ({
                    key: fixedEncodeURIComponent(key),
                    value: fixedEncodeURIComponent(value),
                }))
                .sort((a, b) => {
                    const keyCompare = a.key.localeCompare(b.key);
                    if (keyCompare !== 0) {
                        return keyCompare;
                    }
                    return a.value.localeCompare(b.value);
                })
                .map((v) => `${v.key}=${v.value}`)
                .join("&");
            const canonicalHeaders = headersSorted
                .map(([key, value]) => `${key}:${value}\n`)
                .join("");

            const canonicalRequest =
                httpVerb +
                "\n" +
                canonicalUri +
                "\n" +
                canonicalQueryString +
                "\n" +
                canonicalHeaders +
                "\n" +
                signedHeaders +
                "\n" +
                hashedPayload;

            const hashedCanonicalRequest = crypto
                .createHash("SHA256")
                .update(Buffer.from(canonicalRequest))
                .digest("hex")
                .toLowerCase();

            const stringToSign =
                CONST_AUTHORIZATION_TYPE +
                "\n" +
                xFomopayDate +
                "\n" +
                xFomopayNonce +
                "\n" +
                hashedCanonicalRequest;

            const cMerchant = await merchantConfig.get({
                merchant: authorizationCredentialCredential,
            });

            if (cMerchant === null) {
                throw new AuthError(
                    0x0017,
                    `Merchant "${authorizationCredentialCredential}" is not registered.`
                );
            }

            let publicKey: string;

            try {
                const { publicKey: optPublicKey } = cMerchant;
                publicKey = CommonUtils.assertString(optPublicKey);
            } catch (e) {
                throw new AuthError(
                    0x0017,
                    `Merchant "${authorizationCredentialCredential}" does not have a valid merchant public key registered.`
                );
            }

            const verify = crypto.createVerify("RSA-SHA256");
            verify.write(Buffer.from(stringToSign));
            verify.end();

            if (
                !verify.verify(
                    publicKey,
                    authorizationCredentialSignature,
                    "hex"
                )
            ) {
                throw new AuthError(0x0017, `Unable to verify signature.`);
            }

            if (Math.abs(Date.now() - dateInst.getTime()) > 300000) {
                throw new AuthError(
                    0x0019,
                    `Timestamp out of range (300 seconds).`
                );
            }

            try {
                const idempotent =
                    req.method === "GET" || req.method === "HEAD";

                CommonUtils.assert(
                    await nonceController.add(
                        authorizationCredentialCredential,
                        xFomopayNonce,
                        idempotent
                    ),
                    `Invalid or duplicate nonce "%s" for service "%s".`,
                    xFomopayNonce,
                    authorizationCredentialCredential
                );
            } catch (e) {
                console.error(
                    req.hint,
                    `Error validating requesting nonce or nonce is invalid.`,
                    e
                );
                throw new AuthError(0x0019, `Invalid or duplicate nonce.`);
            }

            let json;

            try {
                if (reqBody.length > 0) {
                    json = JSON.parse(reqBody.toString());
                }
            } catch (e) {
                throw new AuthError(0x0018, `Unable to parse JSON payload.`);
            }

            req.data.set("httpAuthentication", {
                merchant: authorizationCredentialCredential,
                json: json,
                headers: headersRaw,
            });

            next();
        } catch (e) {
            console.error(req.hint, `Error while HttpAuthentication.`, e);
            if (e instanceof AuthError) {
                res.status(401)
                    .set(
                        "WWW-Authenticate",
                        `${CONST_AUTHORIZATION_TYPE} realm="Accessing to protected data", charset="UTF-8"`
                    )
                    .json({
                        message: "Authorization failed.",
                        hint: req.hint,
                    });
                return;
            }
            next(e);
        }
    };
}
