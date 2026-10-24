const { getFileTree } = require("../../helpers/filetreeUtils");
const { userComputed } = require("../../helpers/userUtils");

module.exports = {
  filetree: (data) => getFileTree(data),
  userComputed: (data) => userComputed(data),
  noteProps: (data) => data["dg-note-properties"]
};
