// driveStorage.js
//
// Uploads each session bundle to a Google Drive folder, gzip-compressed
// (see compression.js), instead of writing to local disk. A free
// placeholder so data lands somewhere durable and visible, without
// paying for hosted storage.
//
// IMPORTANT — this file has NOT been run against real Google Drive. It's
// written following the standard googleapis usage pattern, but actually
// verifying it needs real credentials and internet access, neither of
// which exist in the environment this was built in. Test it yourself
// (steps below) before relying on it for anything real.
//
// ---- ONE-TIME SETUP ----
// 1. console.cloud.google.com -> create/select a project.
// 2. Enable the "Google Drive API" for that project.
// 3. IAM & Admin -> Service Accounts -> Create a service account.
// 4. Create a JSON key for it and download the file.
// 5. In Google Drive, create a folder (e.g. "LAA Test Logs") and SHARE it
//    with the service account's email (looks like
//    something@your-project.iam.gserviceaccount.com) as Editor. Required —
//    a service account has no Drive of its own, uploads fail without this.
// 6. Copy the folder's ID from its URL:
//    https://drive.google.com/drive/folders/<THIS_PART_IS_THE_ID>
// 7. Set two environment variables where the server runs:
//    - GOOGLE_SERVICE_ACCOUNT_KEY = entire contents of the downloaded
//      JSON key file, as one string
//    - GOOGLE_DRIVE_FOLDER_ID     = the folder ID from step 6
//
// Requires: npm install googleapis

const { google } = require("googleapis");
const { Readable } = require("stream");
const { compressJson, decompressJson } = require("./compression");

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

function getDriveClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set. See driveStorage.js setup comments."
    );
  }
  if (!FOLDER_ID) {
    throw new Error(
      "GOOGLE_DRIVE_FOLDER_ID environment variable is not set. See driveStorage.js setup comments."
    );
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * Uploads one session bundle as a compressed .json.gz file. Filename
 * includes sessionId + timestamp so re-sends append rather than silently
 * overwrite — matches localStorage.js's append-only behaviour.
 */
async function appendSessionBundle(bundle) {
  const drive = getDriveClient();
  const receivedAt = new Date().toISOString();
  const bundleWithMeta = { ...bundle, receivedAt };

  const compressed = compressJson(bundleWithMeta);
  const fileName = `${bundle.sessionId}_${receivedAt.replace(/[:.]/g, "-")}.json.gz`;

  await drive.files.create({
    requestBody: { name: fileName, parents: [FOLDER_ID] },
    media: { mimeType: "application/gzip", body: Readable.from(compressed) },
  });

  return { receivedAt };
}

/**
 * Lists and downloads every bundle in the Drive folder, decompressing
 * each. Mirrors localStorage's readAllSessionBundles() so GET /logs
 * doesn't need to know which backend is active.
 *
 * Downloads every file on every call — fine for a debug route during
 * development, not meant for a folder with thousands of files.
 */
async function readAllSessionBundles() {
  const drive = getDriveClient();

  const list = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name)",
  });

  const bundles = [];
  for (const file of list.data.files || []) {
    const response = await drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "arraybuffer" }
    );
    bundles.push(decompressJson(Buffer.from(response.data)));
  }

  return bundles;
}

module.exports = { appendSessionBundle, readAllSessionBundles };
