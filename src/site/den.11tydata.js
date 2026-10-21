require("dotenv").config();
const settings = require("../helpers/constants");
const pluginLoader = require("../helpers/pluginLoader");
const { getControlTaskCatalog } = require("../helpers/deadlinesUtils");
const { jsonForInlineScript } = require("../helpers/userUtils");

const allSettings = [
  ...settings.ALL_NOTE_SETTINGS,
  ...pluginLoader.getNoteSettingKeys(),
];

// One page for every date in the deadline table. The date arrives as `?d=17-9`
// and the body is filled in the browser from the control-note catalog.
module.exports = {
  layout: "layouts/note.njk",
  permalink: "/den/",
  title: "День",
  dgDayPage: true,
  eleventyExcludeFromCollections: true,
  eleventyComputed: {
    settings: () => {
      const noteSettings = {};
      allSettings.forEach((setting) => {
        noteSettings[setting] = process.env[setting] === "true";
      });
      noteSettings.dgShowInlineTitle = true;
      noteSettings.dgShowToc = true;
      noteSettings.dgShowTags = false;
      return noteSettings;
    },
    controlTaskCatalogJson: (data) => jsonForInlineScript(getControlTaskCatalog(data)),
  },
};
