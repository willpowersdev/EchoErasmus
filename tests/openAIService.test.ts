import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type OpenAI from "openai";
import { APIConnectionTimeoutError, APIError } from "openai";
import {
    askOpenAI,
    OpenAIResponseError,
    OpenAITimeoutError,
    resetClient,
    SYSTEM_PROMPT,
} from "../src/services/OpenAIService.ts";

/**
 * These are unit tests: a fake client is injected so nothing reaches the real
 * API. Integration tests that spend money live outside `npm test`.
 */
function fakeClient(create: (body: unknown, options?: unknown) => unknown): OpenAI {
    return { responses: { create } } as unknown as OpenAI;
}

const responseBody = (overrides: Record<string, unknown> = {}) => ({
    id: "resp_123",
    status: "completed",
    output_text: "Because of Rayleigh scattering.",
    incomplete_details: null,
    ...overrides,
});

before(() => {
    process.env["LOG_LEVEL"] = "error";
});

afterEach(() => {
    resetClient();
    delete process.env["OPENAI_MODEL"];
    delete process.env["OPENAI_REASONING_EFFORT"];
    delete process.env["OPENAI_TIMEOUT_MS"];
});

describe("askOpenAI", () => {
    it("sends the voice system prompt and returns text plus response id", async () => {
        let received: any;
        resetClient(
            fakeClient((body) => {
                received = body;
                return Promise.resolve(responseBody());
            }),
        );

        const result = await askOpenAI({ prompt: "why is the sky blue" });

        assert.equal(result.text, "Because of Rayleigh scattering.");
        assert.equal(result.responseId, "resp_123");
        assert.equal(received.input, "why is the sky blue");
        assert.equal(received.instructions, SYSTEM_PROMPT);
        assert.equal(received.model, "gpt-5-mini");
        assert.equal(received.store, true, "previous_response_id requires stored responses");
        assert.equal(received.previous_response_id, null);
    });

    it("chains a follow-up onto the previous response", async () => {
        let received: any;
        resetClient(
            fakeClient((body) => {
                received = body;
                return Promise.resolve(responseBody({ id: "resp_456" }));
            }),
        );

        const result = await askOpenAI({
            prompt: "does that happen on mars too",
            previousResponseId: "resp_123",
        });

        assert.equal(received.previous_response_id, "resp_123");
        assert.equal(result.responseId, "resp_456");
    });

    it("honours the configured model and reasoning effort", async () => {
        process.env["OPENAI_MODEL"] = "gpt-5-mini";
        process.env["OPENAI_REASONING_EFFORT"] = "minimal";

        let received: any;
        resetClient(
            fakeClient((body) => {
                received = body;
                return Promise.resolve(responseBody());
            }),
        );

        await askOpenAI({ prompt: "hello" });

        assert.equal(received.model, "gpt-5-mini");
        assert.equal(received.reasoning.effort, "minimal");
    });

    it("falls back to low effort for an unrecognised value", async () => {
        process.env["OPENAI_REASONING_EFFORT"] = "turbo";

        let received: any;
        resetClient(
            fakeClient((body) => {
                received = body;
                return Promise.resolve(responseBody());
            }),
        );

        await askOpenAI({ prompt: "hello" });

        assert.equal(received.reasoning.effort, "low");
    });

    it("passes a per-request timeout inside the Alexa response window", async () => {
        process.env["OPENAI_TIMEOUT_MS"] = "6000";

        let received: any;
        resetClient(
            fakeClient((_body, options) => {
                received = options;
                return Promise.resolve(responseBody());
            }),
        );

        await askOpenAI({ prompt: "hello" });

        assert.equal(received.timeout, 6000);
    });

    it("clamps an unreasonable timeout", async () => {
        process.env["OPENAI_TIMEOUT_MS"] = "60000";

        let received: any;
        resetClient(
            fakeClient((_body, options) => {
                received = options;
                return Promise.resolve(responseBody());
            }),
        );

        await askOpenAI({ prompt: "hello" });

        assert.equal(received.timeout, 9000);
    });

    it("maps a connection timeout to OpenAITimeoutError", async () => {
        resetClient(
            fakeClient(() => Promise.reject(new APIConnectionTimeoutError({ message: "timed out" }))),
        );

        await assert.rejects(askOpenAI({ prompt: "hello" }), OpenAITimeoutError);
    });

    it("maps an API error to OpenAIResponseError with its status", async () => {
        resetClient(
            fakeClient(() =>
                Promise.reject(
                    new APIError(429, { error: { message: "Rate limit reached" } }, "Rate limit reached", undefined),
                ),
            ),
        );

        await assert.rejects(askOpenAI({ prompt: "hello" }), (error: unknown) => {
            assert.ok(error instanceof OpenAIResponseError);
            assert.equal(error.status, 429);
            return true;
        });
    });

    it("rejects when the model returns no text", async () => {
        resetClient(
            fakeClient(() =>
                Promise.resolve(
                    responseBody({
                        output_text: "   ",
                        status: "incomplete",
                        incomplete_details: { reason: "max_output_tokens" },
                    }),
                ),
            ),
        );

        await assert.rejects(askOpenAI({ prompt: "hello" }), OpenAIResponseError);
    });

    it("requires an API key before building a real client", async () => {
        const saved = process.env["OPENAI_API_KEY"];
        delete process.env["OPENAI_API_KEY"];
        resetClient();

        try {
            await assert.rejects(askOpenAI({ prompt: "hello" }), OpenAIResponseError);
        } finally {
            if (saved !== undefined) {
                process.env["OPENAI_API_KEY"] = saved;
            }
        }
    });
});
