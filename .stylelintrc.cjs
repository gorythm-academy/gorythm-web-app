module.exports = {
  extends: [
    'stylelint-config-recommended-scss',
  ],
  plugins: ['stylelint-scss'],
  rules: {
    'selector-class-pattern': null,
    'scss/dollar-variable-pattern': null,
    'scss/comment-no-empty': null,
    'scss/no-global-function-names': null,
    'scss/load-no-partial-leading-underscore': null,
    'no-invalid-position-at-import-rule': null,
    'declaration-block-no-shorthand-property-overrides': null,
    'property-no-deprecated': null,
  },
};
