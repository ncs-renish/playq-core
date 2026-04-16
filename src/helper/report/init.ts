
const fs = require("fs-extra");
const path = require("path");

// Use PLAYQ_RESULTS_DIR if set (from pretest), otherwise default to test-results
const RESULTS_DIR = process.env.PLAYQ_RESULTS_DIR || 'test-results';

try {
    fs.ensureDirSync(path.join(RESULTS_DIR, 'screenshots'));
    fs.emptyDirSync(path.join(RESULTS_DIR, 'screenshots'));

    fs.ensureDirSync(path.join(RESULTS_DIR, 'videos'));
    fs.emptyDirSync(path.join(RESULTS_DIR, 'videos'));

    fs.ensureDirSync(path.join(RESULTS_DIR, 'trace'));
    fs.emptyDirSync(path.join(RESULTS_DIR, 'trace'));

    // Do NOT clean the whole test-results folder!
    // fs.emptyDirSync("test-results");
} catch (error) {
    console.log("⚠️ Folder setup failed! " + error);
}
