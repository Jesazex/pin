module.exports = {
  setupMarkdown(md) {
    const previous = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = (token.info || "").trim().split(/\s+/)[0];
      if (lang !== "mermaid") {
        if (previous) return previous(tokens, idx, options, env, self);
        return self.renderToken(tokens, idx, options);
      }
      // Escape so <br/> in labels stays text. The browser decodes it back
      // before Mermaid reads the element, and a raw tag would be parsed away.
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    };
  },
};
