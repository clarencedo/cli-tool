module.exports = {
    env: {
        es6: true,
        node: true,
    },
    root: true,
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier",
        "plugin:prettier/recommended",
    ],
    parserOptions: {
        project: "./tsconfig.json",
    },
};
