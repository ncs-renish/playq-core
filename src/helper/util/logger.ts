import { transports, format } from "winston";
import * as fs from "fs";
import * as path from "path";

// ✅ Replace invalid characters for Windows file/folder names
function sanitiseFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100);
}

export function options(scenarioName: string) {
    const sanitised = sanitiseFileName(scenarioName);
    const resultsDir = process.env.PLAYQ_RESULTS_DIR || 'test-results';
    const logDir = path.join(resultsDir, "logs", sanitised);

    // ✅ Ensure directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    return {
        transports: [
            new transports.File({
                filename: path.join(logDir, "log.log"),
                level: 'info',
                format: format.combine(
                    format.timestamp({ format: 'MMM-DD-YYYY HH:mm:ss' }),
                    format.align(),
                    format.printf(info => `${info.level}: ${[info.timestamp]}: ${info.message}`)
                )
            }),
        ]
    }
};