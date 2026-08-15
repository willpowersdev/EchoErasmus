/**
 * Integration check — this one DOES call OpenAI and DOES cost money.
 *
 * It is deliberately excluded from `npm test` (which globs `*.test.ts`) so the
 * unit suite stays free and offline. Run it by hand:
 *
 *   node --env-file=.env tests/integration/askOpenAI.integration.ts
 */
import assert from "node:assert/strict";
import { askOpenAI } from "../../src/services/OpenAIService.ts";
import { prepareSpeech } from "../../src/utils/AlexaUtils.ts";

if (!process.env["OPENAI_API_KEY"]) {
    console.error("OPENAI_API_KEY is not set. Try: node --env-file=.env <this file>");
    process.exit(1);
}

const startedAt = Date.now();
const first = await askOpenAI({ prompt: "Why is the sky blue?" });
const firstMs = Date.now() - startedAt;

console.log(`\nQ: Why is the sky blue?\nA: ${prepareSpeech(first.text)}`);
console.log(`   (${firstMs} ms, response id ${first.responseId})`);

assert.ok(first.text.length > 0, "expected a non-empty answer");
assert.ok(first.responseId, "expected a response id to chain follow-ups");

// The follow-up only makes sense if the previous turn carried over.
const followUpStartedAt = Date.now();
const second = await askOpenAI({
    prompt: "Does that happen on Mars too?",
    previousResponseId: first.responseId,
});
const secondMs = Date.now() - followUpStartedAt;

console.log(`\nQ: Does that happen on Mars too?\nA: ${prepareSpeech(second.text)}`);
console.log(`   (${secondMs} ms, response id ${second.responseId})`);

assert.ok(second.text.length > 0, "expected a non-empty follow-up answer");

if (firstMs > 7000 || secondMs > 7000) {
    console.warn(
        "\nWARNING: latency is close to the Alexa response window. " +
            "Lower OPENAI_REASONING_EFFORT or switch OPENAI_MODEL to a faster model.",
    );
}

console.log("\nIntegration check passed.");
