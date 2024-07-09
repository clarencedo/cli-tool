import process from "process";
import path from "path";
import { execSync } from "child_process";
import CommonUtils from "./CommonUtils";

const kVersionRegex = /^(\d+)\.(\d+)\.(\d+)$/;

export default class AppInfo {
    private optMajor: string;
    private optMinor: string;
    private optFix: string;
    private optBuild: number;
    private optCommit: string;
    private optShortCommit: string;
    private optName: string;

    private constructor(options: {
        major: string;
        minor: string;
        fix: string;
        build: number;
        commit: string;
        shortCommit: string;
        name: string;
    }) {
        this.optMajor = options.major;
        this.optMinor = options.minor;
        this.optFix = options.fix;
        this.optBuild = options.build;
        this.optCommit = options.commit;
        this.optShortCommit = options.shortCommit;
        this.optName = options.name;
    }

    static populate() {
        let baseDir: string | undefined;
        try {
            const mainModule = process.mainModule;
            if (mainModule === undefined) {
                throw new Error("process.mainModule is undefined.");
            }
            baseDir = path.parse(mainModule.filename).dir;
        } catch (e) {
            console.warn("Unable to locate base directory.", e);
        }
        if (baseDir === undefined) {
            return new AppInfo({
                major: "0",
                minor: "0",
                fix: "0",
                build: 0,
                commit: "N/A",
                shortCommit: "N/A",
                name: "N/A",
            });
        }
        try {
            const {
                major: aMajor,
                minor: aMinor,
                fix: aFix,
                build: aBuild,
                commit: aCommit,
                shortCommit: aShortCommit,
                name: aName,
            } = require(path.join(baseDir, ".appinfo.json"));
            return new AppInfo({
                major: CommonUtils.assertString(aMajor),
                minor: CommonUtils.assertString(aMinor),
                fix: CommonUtils.assertString(aFix),
                build: CommonUtils.assertSafeInteger(aBuild),
                commit: CommonUtils.assertString(aCommit),
                shortCommit: CommonUtils.assertString(aShortCommit),
                name: CommonUtils.assertString(aName),
            });
        } catch (e) {
            console.warn(
                'Unable to locate ".appinfo.json" or content invalid.',
                e
            );
        }
        let name: string = "N/A",
            version: string = "0.0.0";
        try {
            const { name: aName, version: aVersion } = require(path.join(
                baseDir,
                "../package.json"
            ));
            name = CommonUtils.assertString(aName);
            version = CommonUtils.assertString(aVersion);
        } catch (e) {
            console.warn(
                'Unable to locate "package.json" or content invalid.',
                e
            );
        }
        let build: number = 0;
        try {
            build = CommonUtils.parseIntSafe(
                execSync("git rev-list --count HEAD", {
                    cwd: baseDir,
                })
                    .toString()
                    .trim()
            );
        } catch (e) {
            console.warn('Error executing "git rev-list --count HEAD".', e);
        }
        let commit: string = "N/A";
        try {
            commit = execSync("git rev-parse HEAD", { cwd: baseDir })
                .toString()
                .trim();
        } catch (e) {
            console.warn('Error executing "git rev-parse HEAD".', e);
        }
        let shortCommit: string = "N/A";
        try {
            shortCommit = execSync("git rev-parse --short HEAD", {
                cwd: baseDir,
            })
                .toString()
                .trim();
        } catch (e) {
            console.warn('Error executing "git rev-parse HEAD".', e);
        }
        const version_match = kVersionRegex.exec(version);
        let major: string = "0",
            minor: string = "0",
            fix: string = "0";
        if (version_match !== null) {
            major = version_match[1];
            minor = version_match[2];
            fix = version_match[3];
        } else {
            console.warn("Unable to parse version number from git response.");
        }
        return new AppInfo({
            major: major,
            minor: minor,
            fix: fix,
            build: build,
            commit: commit,
            shortCommit: shortCommit,
            name: name,
        });
    }

    get version(): string {
        const major = this.optMajor;
        const minor = this.optMinor;
        const fix = this.optFix;
        const build = this.optBuild;

        return `${major}.${minor}.${fix}.${build}`;
    }

    get name(): string {
        return this.optName;
    }

    get commit(): string {
        return this.optCommit;
    }

    get shortCommit(): string {
        return this.optShortCommit;
    }
}
