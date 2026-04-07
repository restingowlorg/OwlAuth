module.exports = {
  "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{js,cjs}": ["prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
};
