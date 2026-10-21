const deadlineMentionPattern = /<(дедлайны|дедлайнам|дедлайнов)>/gi;

function userMarkdownSetup(md) {
  md.core.ruler.after("inline", "deadline-table-mentions", function (state) {
    const tokens = state.tokens;
    for (let b = 0; b < tokens.length; b++) {
      const block = tokens[b];
      if (block.type !== "inline" || !block.children) continue;
      const next = [];
      let linkDepth = 0;
      for (let i = 0; i < block.children.length; i++) {
        const child = block.children[i];
        if (child.type === "link_open") linkDepth += 1;
        else if (child.type === "link_close") linkDepth = Math.max(0, linkDepth - 1);

        if (child.type !== "text" || linkDepth > 0 || child.content.indexOf("<") === -1) {
          next.push(child);
          continue;
        }

        const text = child.content;
        deadlineMentionPattern.lastIndex = 0;
        let last = 0;
        let match = deadlineMentionPattern.exec(text);
        if (!match) {
          next.push(child);
          continue;
        }
        while (match) {
          if (match.index > last) {
            const before = new state.Token("text", "", 0);
            before.content = text.slice(last, match.index);
            next.push(before);
          }
          const word = match[1];
          const open = new state.Token("link_open", "a", 1);
          open.attrSet("href", "#дедлайны");
          open.attrSet("class", "internal-link");
          open.attrSet("data-open-deadline-table", "");
          const label = new state.Token("text", "", 0);
          label.content = word;
          const close = new state.Token("link_close", "a", -1);
          next.push(open, label, close);
          last = match.index + match[0].length;
          match = deadlineMentionPattern.exec(text);
        }
        if (last < text.length) {
          const after = new state.Token("text", "", 0);
          after.content = text.slice(last);
          next.push(after);
        }
      }
      block.children = next;
    }
  });
}
function userEleventySetup(eleventyConfig) {
  // The eleventyConfig parameter stands for the the config instantiated in /.eleventy.js.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
