function userMarkdownSetup() {
  // Deadline tables are opened by wikilinks whose target starts with "/".
  // The link filter in .eleventy.js turns those into anchors.
}
function userEleventySetup(eleventyConfig) {
  // The eleventyConfig parameter stands for the the config instantiated in /.eleventy.js.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
