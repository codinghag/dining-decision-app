const fs = require("fs");
const path = require("path");

// gh-pages' temp clone inherits this repo's root .gitignore (which excludes
// node_modules/) before copying dist/ in. Since Metro names web asset chunks
// after their source module path (e.g. assets/node_modules/@react-navigation/
// .../back-icon...png), that pattern silently drops real site assets from
// `git add`. Deleting it here (run via gh-pages' --before-add hook) removes
// the stale ignore rules before staging.
module.exports = function beforeAdd(git) {
  const gitignorePath = path.join(git.cwd, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    fs.unlinkSync(gitignorePath);
  }
};
