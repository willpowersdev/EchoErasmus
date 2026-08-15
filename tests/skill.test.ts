import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
    OpenAIResponseError,
    OpenAITimeoutError,
} from "../src/services/OpenAIService.ts";
import { Speech } from "../src/utils/Speech.ts";
import {
    intentRequest,
    invoke,
    launchRequest,
    repromptText,
    sessionEndedRequest,
    spokenText,
    stubAsk,
} from "./helpers.ts";

const answer = (text: string, responseId = "resp_1") =>
    stubAsk(() => ({ text, responseId }));

before(() => {
    // Keep the test output readable; the handlers log at info by default.
    process.env["LOG_LEVEL"] = "error";
});

describe("LaunchRequest", () => {
    it("welcomes the user and keeps the session open", async () => {
        const response = await invoke(launchRequest(), answer("unused"));

        assert.equal(spokenText(response), Speech.welcome);
        assert.equal(repromptText(response), Speech.welcomeReprompt);
        assert.equal(response.response.shouldEndSession, false);
    });
});

describe("AskOpenAIIntent", () => {
    it("speaks the model's answer and stores the response id", async () => {
        const ask = answer("The sky is blue because of Rayleigh scattering.", "resp_abc");

        const response = await invoke(
            intentRequest("AskOpenAIIntent", { question: "why is the sky blue" }),
            ask,
        );

        assert.equal(ask.calls.length, 1);
        assert.equal(ask.calls[0]?.prompt, "why is the sky blue");
        assert.equal(ask.calls[0]?.previousResponseId, undefined);

        assert.equal(spokenText(response), "The sky is blue because of Rayleigh scattering.");
        assert.equal(repromptText(response), Speech.followUpReprompt);
        assert.equal(response.response.shouldEndSession, false);
        assert.deepEqual(response.sessionAttributes, {
            previousOpenAIResponseId: "resp_abc",
        });
    });

    it("answers the freeform intent the same way", async () => {
        const ask = answer("Ganymede.", "resp_moon");

        const response = await invoke(
            intentRequest("AskOpenAIFreeformIntent", {
                question: "what is the largest moon in the solar system",
            }),
            ask,
        );

        assert.equal(ask.calls.length, 1);
        assert.equal(spokenText(response), "Ganymede.");
    });

    it("passes the stored response id on a follow-up turn", async () => {
        const ask = answer("He was 41.", "resp_2");

        const response = await invoke(
            intentRequest(
                "AskOpenAIIntent",
                { question: "how old was he when he died" },
                { previousOpenAIResponseId: "resp_1" },
            ),
            ask,
        );

        assert.equal(ask.calls[0]?.previousResponseId, "resp_1");
        assert.deepEqual(response.sessionAttributes, { previousOpenAIResponseId: "resp_2" });
    });

    it("asks again when the question slot is empty", async () => {
        const ask = answer("should not be called");

        const response = await invoke(intentRequest("AskOpenAIIntent", { question: "" }), ask);

        assert.equal(ask.calls.length, 0, "OpenAI must not be called without a question");
        assert.equal(spokenText(response), Speech.missingQuestion);
        assert.equal(response.response.shouldEndSession, false);
    });

    it("asks again when the question slot is missing entirely", async () => {
        const ask = answer("should not be called");

        const response = await invoke(intentRequest("AskOpenAIIntent"), ask);

        assert.equal(ask.calls.length, 0);
        assert.equal(spokenText(response), Speech.missingQuestion);
    });

    it("escapes characters that would break the SSML payload", async () => {
        const ask = answer('Use "AT&T" if 5 < 6 & 7 > 6.');

        const response = await invoke(
            intentRequest("AskOpenAIIntent", { question: "read that back" }),
            ask,
        );

        const ssml = spokenText(response);
        assert.ok(ssml.includes("&amp;"), "ampersands must be escaped");
        assert.ok(ssml.includes("&lt;") && ssml.includes("&gt;"), "angle brackets must be escaped");
        assert.ok(!/[<>]/.test(ssml.replace(/&[a-z]+;/g, "")), "no raw angle brackets remain");
    });

    it("truncates an over-long answer at a sentence boundary", async () => {
        process.env["MAX_RESPONSE_CHARACTERS"] = "300";
        try {
            const sentence = "This is a complete sentence about the topic at hand. ";
            const ask = answer(sentence.repeat(40));

            const response = await invoke(
                intentRequest("AskOpenAIIntent", { question: "tell me everything" }),
                ask,
            );

            const spoken = spokenText(response);
            assert.ok(spoken.length <= 300, `expected <= 300 characters, got ${spoken.length}`);
            assert.ok(spoken.endsWith("."), "truncation should land on a sentence boundary");
        } finally {
            delete process.env["MAX_RESPONSE_CHARACTERS"];
        }
    });
});

describe("OpenAI failures", () => {
    it("speaks the timeout message and keeps the session open", async () => {
        const ask = stubAsk(() => {
            throw new OpenAITimeoutError();
        });

        const response = await invoke(
            intentRequest("AskOpenAIIntent", { question: "why is the sky blue" }),
            ask,
        );

        assert.equal(spokenText(response), Speech.timeout);
        assert.equal(response.response.shouldEndSession, false);
    });

    it("speaks a generic message on an API error without leaking details", async () => {
        const ask = stubAsk(() => {
            throw new OpenAIResponseError("Incorrect API key provided: sk-secret", 401);
        });

        const response = await invoke(
            intentRequest("AskOpenAIIntent", { question: "why is the sky blue" }),
            ask,
        );

        const spoken = spokenText(response);
        assert.equal(spoken, Speech.genericError);
        assert.ok(!spoken.includes("sk-secret"), "error text must never reach the user");
        assert.equal(response.response.shouldEndSession, false);
    });

    it("preserves the previous context when a turn fails", async () => {
        const ask = stubAsk(() => {
            throw new OpenAITimeoutError();
        });

        const response = await invoke(
            intentRequest(
                "AskOpenAIIntent",
                { question: "and then what" },
                { previousOpenAIResponseId: "resp_1" },
            ),
            ask,
        );

        assert.deepEqual(response.sessionAttributes, { previousOpenAIResponseId: "resp_1" });
    });
});

describe("NewConversationIntent", () => {
    it("clears the stored response id", async () => {
        const response = await invoke(
            intentRequest("NewConversationIntent", {}, { previousOpenAIResponseId: "resp_1" }),
            answer("unused"),
        );

        assert.equal(spokenText(response), Speech.newConversation);
        assert.equal(response.response.shouldEndSession, false);
        assert.deepEqual(response.sessionAttributes, {});
    });

    it("makes the next question start a fresh chain", async () => {
        const cleared = await invoke(
            intentRequest("NewConversationIntent", {}, { previousOpenAIResponseId: "resp_1" }),
            answer("unused"),
        );

        const ask = answer("Ganymede.", "resp_new");
        await invoke(
            intentRequest(
                "AskOpenAIIntent",
                { question: "what is the largest moon" },
                cleared.sessionAttributes ?? {},
            ),
            ask,
        );

        assert.equal(ask.calls[0]?.previousResponseId, undefined);
    });
});

describe("Built-in intents", () => {
    it("explains itself for HelpIntent", async () => {
        const response = await invoke(intentRequest("AMAZON.HelpIntent"), answer("unused"));

        assert.equal(spokenText(response), Speech.help);
        assert.equal(response.response.shouldEndSession, false);
    });

    for (const intentName of ["AMAZON.StopIntent", "AMAZON.CancelIntent"]) {
        it(`says goodbye and ends the session for ${intentName}`, async () => {
            const response = await invoke(intentRequest(intentName), answer("unused"));

            assert.equal(spokenText(response), Speech.goodbye);
            assert.equal(response.response.shouldEndSession, true);
        });
    }

    it("reprompts on FallbackIntent", async () => {
        const response = await invoke(
            intentRequest("AMAZON.FallbackIntent"),
            answer("unused"),
        );

        assert.equal(spokenText(response), Speech.missingQuestion);
        assert.equal(response.response.shouldEndSession, false);
    });

    it("describes the data path for PrivacyIntent", async () => {
        const response = await invoke(intentRequest("PrivacyIntent"), answer("unused"));

        assert.equal(spokenText(response), Speech.privacy);
    });
});

describe("SessionEndedRequest", () => {
    it("returns an empty response without speaking", async () => {
        const response = await invoke(sessionEndedRequest("USER_INITIATED"), answer("unused"));

        assert.equal(response.response.outputSpeech, undefined);
    });
});

describe("ErrorHandler", () => {
    it("catches an unrouted intent with a friendly message", async () => {
        const response = await invoke(intentRequest("SomeUnknownIntent"), answer("unused"));

        assert.equal(spokenText(response), Speech.genericError);
        assert.equal(response.response.shouldEndSession, false);
    });

    it("catches an unexpected throw from the service layer", async () => {
        const ask = stubAsk(() => {
            throw new TypeError("Cannot read properties of undefined");
        });

        const response = await invoke(
            intentRequest("AskOpenAIIntent", { question: "why is the sky blue" }),
            ask,
        );

        assert.equal(spokenText(response), Speech.genericError);
    });
});
