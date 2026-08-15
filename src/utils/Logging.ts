/**
 * Minimal structured logging for CloudWatch.
 *
 * Everything is emitted as single-line JSON so CloudWatch Logs Insights can
 * query it. Secrets are never accepted here by construction: callers pass
 * explicit fields, and no helper ever reads process.env credentials.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

function configuredLevel(): LogLevel {
    const raw = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
        return raw;
    }
    return "info";
}

/** True when user prompts and answers may be written to logs. Off by default. */
export function isPromptLoggingEnabled(): boolean {
    return process.env["LOG_PROMPTS"] === "true";
}

export function log(
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) {
        return;
    }

    const line = JSON.stringify({ level, event, ...fields });

    if (level === "error") {
        console.error(line);
    } else if (level === "warn") {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export const logger = {
    debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
    info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
    error: (event: string, fields?: Record<string, unknown>) => log("error", event, fields),
};

/**
 * Reduce an unknown thrown value to loggable fields.
 *
 * Only the error name, message and stack are extracted — never the originating
 * request, which would carry the Authorization header.
 */
export function describeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack,
        };
    }
    return { errorName: "NonError", errorMessage: String(error) };
}
