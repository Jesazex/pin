(function () {
  var nodes = document.querySelectorAll("pre.mermaid");
  if (!nodes.length) return;

  var dark = document.body.classList.contains("theme-dark");
  import("https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs")
    .then(function (mod) {
      var mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "default",
        fontFamily: "inherit",
        flowchart: { htmlLabels: true },
      });
      return mermaid.run({
        nodes: Array.prototype.slice.call(nodes),
        suppressErrors: true,
      });
    })
    .catch(function () {});
})();
