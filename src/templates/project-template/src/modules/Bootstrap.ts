import path from "path";

export default class Bootstrap {
    private optBootstrapBasePath: string;

    constructor(basePath: string) {
        this.optBootstrapBasePath = basePath;
    }

    install() {
        try {
            require(path.join(this.optBootstrapBasePath, "./.bootstrap.js"));
        } catch (e) {
            require("source-map-support/register");
            const tsConfigPaths = require("tsconfig-paths");
            const cleanup = tsConfigPaths.register({
                baseUrl: this.optBootstrapBasePath,
                paths: require(path.join(process.cwd(), "./tsconfig.json"))
                    .compilerOptions.paths,
            });
            void cleanup;
            console.log(`Unable to locate ".bootstrap.js".`);
        }
    }
}
