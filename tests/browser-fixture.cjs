const { existsSync } = require('node:fs');
// CI may install Playwright's bundled browser; development can use Chromium.
module.exports.chromiumPath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
