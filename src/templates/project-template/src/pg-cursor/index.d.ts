declare module "pg-cursor" {
    import { Submittable, Connection } from "pg";
    export default class Cursor implements Submittable {
        constructor(query: string, vars?: any[]);
        submit(connection: Connection): void;
        read(rowCount: number, callback: (err: Error, rows: any[]) => void): void;
        close(callback: () => void): void;
    }
}
