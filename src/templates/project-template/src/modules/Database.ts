import { Pool, PoolClient, QueryResult } from "pg";
import Cursor from "pg-cursor";
import { ConnectionOptions } from "tls";

import CommonUtils from "@/modules/CommonUtils";

export { Cursor };

const kQueryCommit = "COMMIT";
const kQueryRollback = "ROLLBACK";

export interface QueryResultRow {
    [column: string]: unknown;
}

export class QueryError extends Error {
    originalError: Error;

    constructor(originalError: Error, originalStack: string) {
        super(originalError.message);

        this.name = this.constructor.name;

        if (originalError.stack === undefined) {
            this.stack =
                originalError.message +
                "\n" +
                originalStack.split("\n").slice(2).join("\n");
        } else {
            this.stack =
                originalError.stack.split("\n").slice(0, 1) +
                "\n" +
                originalStack.split("\n").slice(2).join("\n");
        }

        this.originalError = originalError;
    }
}

export enum EIsolationLevel {
    ReadUncommitted = "READ UNCOMMITTED",
    ReadCommitted = "READ COMMITTED",
    RepeatableRead = "REPEATABLE READ",
    Serializable = "SERIALIZABLE",
}

export class DatabaseConnection {
    static #connectionSequence = -1n;

    #poolClient: PoolClient;
    #debug: boolean = false;
    #error: boolean = false;
    #inTransaction: boolean = false;
    #released: boolean = false;
    #connectionID: bigint = ++DatabaseConnection.#connectionSequence;

    constructor(poolClient: PoolClient, debug?: boolean) {
        this.#poolClient = poolClient;

        this.#debug = debug ?? false;

        this.#debug && this.log("DatabaseConnection::DatabaseConnection()");
    }

    private healthy() {
        return !this.#error && !this.#released;
    }

    private releaseClient(e?: Error) {
        if (this.#released) {
            return;
        }

        if (e !== undefined) {
            this.#debug &&
                this.log(
                    "DatabaseConnection::releaseClient()",
                    "WithError:",
                    e.stack ?? "(Stack not available)"
                );
        } else {
            this.#debug && this.log("DatabaseConnection::releaseClient()");
        }

        this.#released = true;

        this.#poolClient.release(e);
    }

    private prepareStack(): string {
        return new Error().stack ?? "";
    }

    private log(...message: string[]) {
        console.log(
            `[DBConnection #%s] %s`,
            this.#connectionID,
            message.join("\n")
        );
    }

    /**
     * Start a transaction by calling `START TRANSACTION`.
     * If `readonly` is true, the transaction will be started readonly.
     * @param {boolean} readonly
     * @param {EIsolationLevel} isolationLevel
     */
    async startTransaction(
        readonly?: boolean,
        isolationLevel?: EIsolationLevel
    ): Promise<void> {
        const stack = this.prepareStack();

        try {
            const sqlIsolationLevel =
                isolationLevel ?? EIsolationLevel.ReadCommitted;

            this.#debug &&
                this.log(
                    "DatabaseConnection::startTransaction()",
                    "IsolationLevel:",
                    sqlIsolationLevel
                );

            CommonUtils.assert(
                this.healthy(),
                "Current connection is not in a status can be used for query."
            );

            CommonUtils.assert(
                !this.#inTransaction,
                "Transaction cannot be started within a transaction."
            );

            await this.#poolClient.query(
                readonly
                    ? `START TRANSACTION ISOLATION LEVEL ${sqlIsolationLevel} READ ONLY`
                    : `START TRANSACTION ISOLATION LEVEL ${sqlIsolationLevel}`
            );

            this.#inTransaction = true;
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Query a prepared statement.
     * @param {string} prepared_stmt
     * @param {any[]} vars
     */
    async query(
        prepared_stmt: string,
        vars: any[] = []
    ): Promise<QueryResult<QueryResultRow>> {
        const stack = this.prepareStack();

        try {
            this.#debug &&
                this.log(
                    "DatabaseConnection::query()",
                    "PreparedStatement:",
                    prepared_stmt,
                    "Arguments:",
                    JSON.stringify(
                        vars,
                        (key, value) =>
                            typeof value === "bigint" ? value.toString() : value // return everything else unchanged
                    )
                );

            CommonUtils.assert(
                this.healthy(),
                "Current connection is not in a status can be used for query."
            );

            return await this.#poolClient.query(prepared_stmt, vars);
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Query a cursor.
     * @param {Cursor} cursor
     */
    queryCursor(cursor: Cursor): Cursor {
        const stack = this.prepareStack();

        try {
            this.#debug && this.log("DatabaseConnection::queryCursor()");

            CommonUtils.assert(
                this.healthy(),
                "Connection is not in a status can be used for query."
            );

            return this.#poolClient.query(cursor);
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Commit a transaction by querying `COMMIT`.
     */
    async commit(): Promise<void> {
        const stack = this.prepareStack();

        try {
            this.#debug && this.log("DatabaseConnection::commit()");

            CommonUtils.assert(
                this.healthy(),
                "Connection is not in a status can be used for query."
            );

            CommonUtils.assert(
                this.#inTransaction,
                "Cannot commit connection outside a transaction."
            );

            await this.#poolClient.query(kQueryCommit);

            this.#inTransaction = false;
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Rollback a transaction by querying `ROLLBACK`.
     */
    async rollback(): Promise<void> {
        const stack = this.prepareStack();

        try {
            this.#debug && this.log("DatabaseConnection::rollback()");

            CommonUtils.assert(
                this.healthy(),
                "Connection is not in a status can be used for query."
            );

            CommonUtils.assert(
                this.#inTransaction,
                "Cannot rollback connection outside a transaction."
            );

            await this.#poolClient.query(kQueryRollback);

            this.#inTransaction = false;
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Release and return current connection into pool.
     */
    release() {
        const stack = this.prepareStack();

        try {
            this.#debug && this.log("DatabaseConnection::release()");

            CommonUtils.assert(
                !this.#inTransaction,
                "Transaction not committed or rolledback cannot be returned into pool."
            );

            CommonUtils.assert(
                !this.#error,
                "Transaction is in an error status that cannot be returned into pool."
            );

            this.releaseClient();
        } catch (e) {
            const enhancedError = new QueryError(
                e instanceof Error ? e : new Error(String(e)),
                stack
            );

            this.#error = true;

            this.releaseClient(enhancedError);

            throw enhancedError;
        }
    }

    /**
     * Try our best to rollback and release this connection.
     */
    disconnect() {
        this.#debug && this.log("DatabaseConnection::disconnect()");

        this.releaseClient(
            new Error("Giving up connection due to disconnect.")
        );
    }
}

export type TDatabaseConnectionPoolConstructorOptionsPool = {
    max?: number | undefined;
    idleTimeoutMillis?: number | undefined;
};

export type TDatabaseConnectionPoolConstructorOptions = {
    pool: TDatabaseConnectionPoolConstructorOptionsPool;
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
    debug: boolean;
    ssl?: boolean | ConnectionOptions | undefined;
    applicationName?: string;
};

export class DatabaseConnectionPool {
    #debug: boolean;
    #pool: Pool;

    constructor(options: TDatabaseConnectionPoolConstructorOptions) {
        this.#debug = options.debug;

        this.#pool = new Pool({
            max: options.pool.max,
            idleTimeoutMillis: options.pool.idleTimeoutMillis ?? 30000,
            user: options.user,
            password: options.password,
            host: options.host,
            port: options.port,
            database: options.database,
            ssl: options.ssl,
            application_name: options.applicationName,
        });
    }

    /**
     * Retrieves a connection from Database Pool.
     */
    async getConnection(): Promise<DatabaseConnection> {
        return new DatabaseConnection(await this.#pool.connect(), this.#debug);
    }

    rawPool() {
        return this.#pool;
    }
}
