// storage/index.js
//
// index.js only ever calls two functions: appendSessionBundle(bundle) and
// readAllSessionBundles(). This file's only job is deciding which actual
// backend those calls go to, based on STORAGE_BACKEND.
//
// THIS is what makes swapping storage easy later:
//   - STORAGE_BACKEND=drive routes to Google Drive (driveStorage.js) —
//     free placeholder, storing on Garvit's Drive.
//   - When NTNU's real storage exists: either
//       (a) if it's filesystem-like, point localStorage.js's DATA_DIR at
//           it and keep STORAGE_BACKEND=local, or
//       (b) write one new file (e.g. ntnuStorage.js) implementing the
//           same two functions, add one case below, set
//           STORAGE_BACKEND=ntnu.
//   Either way, index.js and every route in it never changes.
//
// Defaults to "local" if STORAGE_BACKEND isn't set.

const BACKEND = process.env.STORAGE_BACKEND || "local";

let backend;
switch (BACKEND) {
  case "drive":
    backend = require("./driveStorage");
    break;
  case "local":
  default:
    backend = require("./localStorage");
    break;
}

console.log(`[storage] Using "${BACKEND}" backend`);

module.exports = {
  appendSessionBundle: backend.appendSessionBundle,
  readAllSessionBundles: backend.readAllSessionBundles,
};
