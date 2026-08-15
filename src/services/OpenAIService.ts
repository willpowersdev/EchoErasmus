/**
 * The only place in the project that talks to OpenAI.
 *
 * Alexa handlers depend on `askOpenAI` and the two error classes below, and on
 * nothing from the OpenAI SDK directly, so the conversation backend can be
 * swapped or extended (tool calling, retrieval) without touching transport code.
 */

import OpenAI, { APIConnectionTimeoutError, APIUserAbortError } from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import { logger } from "../utils/Logging.ts";

export interface AskOpenAIOptions {
    prompt: string;
    /** Chains this turn onto a previous response so context carries over. */
    previousResponseId?: string;
}

export interface AskOpenAIResult {
    text: string;
    responseId?: string;
}

/** The request exceeded the time Alexa is willing to wait. */
export class OpenAITimeoutError extends Error {
    constructor(message = "OpenAI request timed out") {
        super(message);
        this.name = "OpenAITimeoutError";
    }
}

/** OpenAI was reached but did not return usable text. */
export class OpenAIResponseError extends Error {
    readonly status: number | undefined;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "OpenAIResponseError";
        this.status = status;
    }
}

export const SYSTEM_PROMPT = `You are a voice assistant speaking through an Amazon Echo.

Answer naturally and conversationally.

Keep responses concise unless the user explicitly requests detail. Aim for two or three sentences.

Do not use Markdown formatting, tables, headings, bullets, code fences, URLs, or other formatting that sounds awkward when spoken aloud.

When explaining code, summarize verbally rather than reading long code blocks.

Avoid emoji.

Assume all output will be converted to speech.`;

// gpt-5-mini over gpt-5 purely for latency: measured ~2-3s versus ~4-5s, and
// consistently so. Alexa's ~8s cutoff is a cliff, so predictability matters
// more than the quality ceiling. Override with OPENAI_MODEL, no rebuild needed.
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_TIMEOUT_MS = 7500;

/**
 * Client is created lazily and cached, so importing this module never requires
 * an API key — unit tests import the handlers without credentials in scope.
 * Lambda reuses the client across warm invocations.
 */
let cachedClient: OpenAI | undefined;

export function getClient(): OpenAI {
    if (cachedClient) {
        return cachedClient;
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
        throw new OpenAIResponseError("OPENAI_API_KEY is not configured");
    }

    cachedClient = new OpenAI({
        apiKey,
        // Alexa gives us roughly eight seconds; a retry storm would blow past it.
        maxRetries: 0,
        timeout: requestTimeoutMs(),
    });

    return cachedClient;
}

/** Test seam: drop the cached client so a new API key or mock takes effect. */
export function resetClient(client?: OpenAI): void {
    cachedClient = client;
}

function requestTimeoutMs(): number {
    const raw = process.env["OPENAI_TIMEOUT_MS"];
    const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(Math.max(parsed, 1000), 9000);
}

function reasoningEffort(): ReasoningEffort {
    const raw = (process.env["OPENAI_REASONING_EFFORT"] ?? "low").toLowerCase();
    const allowed = ["none", "minimal", "low", "medium", "high"];
    return (allowed.includes(raw) ? raw : "low") as ReasoningEffort;
}

/**
 * Ask OpenAI a single question and return spoken-ready text.
 *
 * Throws {@link OpenAITimeoutError} or {@link OpenAIResponseError}; callers turn
 * those into a friendly spoken message rather than surfacing details to the user.
 */
export async function askOpenAI(options: AskOpenAIOptions): Promise<AskOpenAIResult> {
    const model = process.env["OPENAI_MODEL"] ?? DEFAULT_MODEL;
    const startedAt = process.hrtime.bigint();

    logger.info("OpenAIRequest", {
        model,
        promptCharacterCount: options.prompt.length,
        hasPreviousResponseId: Boolean(options.previousResponseId),
    });

    let response;
    try {
        response = await getClient().responses.create(
            {
                model,
                instructions: SYSTEM_PROMPT,
                input: options.prompt,
                // Server-side state is what makes previous_response_id work.
                store: true,
                previous_response_id: options.previousResponseId ?? null,
                reasoning: { effort: reasoningEffort() },
                text: { verbosity: "low" },
            },
            { timeout: requestTimeoutMs() },
        );
    } catch (error) {
        if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
            throw new OpenAITimeoutError();
        }
        if (error instanceof OpenAI.APIError) {
            // `error.message` is OpenAI's text, never the request headers.
            throw new OpenAIResponseError(error.message, error.status);
        }
        throw error;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const text = response.output_text?.trim() ?? "";

    logger.info("OpenAIResponse", {
        responseId: response.id,
        status: response.status,
        incompleteReason: response.incomplete_details?.reason,
        characterCount: text.length,
        durationMs: Math.round(durationMs),
    });

    if (!text) {
        // A stored-but-empty response is still a valid chain anchor, but there
        // is nothing to speak, so treat it as a failure the handler can phrase.
        throw new OpenAIResponseError(
            `Empty response from model (status: ${response.status ?? "unknown"})`,
        );
    }

    return { text, responseId: response.id };
}
