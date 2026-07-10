module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["solid", "@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:solid/typescript",
    "plugin:@typescript-eslint/recommended"
  ],
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  rules: {
    "solid/prefer-for": "warn",
    "solid/reactivity": "warn",
    "solid/no-destructure": "error"
  }
};
