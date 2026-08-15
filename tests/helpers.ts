import type { RequestEnvelope, ResponseEnvelope } from "ask-sdk-model";
import type { AskOpenAIOptions, AskOpenAIResult } from "../src/services/OpenAIService.ts";
import { createSkill } from "../src/index.ts";

/**
 * Test envelopes are built by hand rather than pulled from a fixture library so
 * the shape of what Alexa actually sends stays visible in the tests.
 */
function baseEnvelope(sessionAttributes: Record<string, unknown>): Omit<RequestEnvelope, "request"> {
    return {
        version: "1.0",
        session: {
            new: false,
            sessionId: "amzn1.echo-api.session.test",
            application: { applicationId: "amzn1.ask.skill.test" },
            attributes: sessionAttributes,
            user: { userId: "amzn1.ask.account.test" },
        },
        context: {
            System: {
                application: { applicationId: "amzn1.ask.skill.test" },
                user: { userId: "amzn1.ask.account.test" },
                apiEndpoint: "https://api.amazonalexa.com",
            },
        },
    };
}

export function launchRequest(
    sessionAttributes: Record<string, unknown> = {},
): RequestEnvelope {
    return {
        ...baseEnvelope(sessionAttributes),
        request: {
            type: "LaunchRequest",
            requestId: "amzn1.echo-api.request.test",
            timestamp: "2026-01-01T00:00:00Z",
            locale: "en-US",
        },
    };
}

export function intentRequest(
    intentName: string,
    slots: Record<string, string> = {},
    sessionAttributes: Record<string, unknown> = {},
): RequestEnvelope {
    return {
        ...baseEnvelope(sessionAttributes),
        request: {
            type: "IntentRequest",
            requestId: "amzn1.echo-api.request.test",
            timestamp: "2026-01-01T00:00:00Z",
            locale: "en-US",
            dialogState: "COMPLETED",
            intent: {
                name: intentName,
                confirmationStatus: "NONE",
                slots: Object.fromEntries(
                    Object.entries(slots).map(([name, value]) => [
                        name,
                        { name, value, confirmationStatus: "NONE" as const },
                    ]),
                ),
            },
        },
    };
}

export function sessionEndedRequest(reason: "USER_INITIATED" | "ERROR"): RequestEnvelope {
    return {
        ...baseEnvelope({}),
        request: {
            type: "SessionEndedRequest",
            requestId: "amzn1.echo-api.request.test",
            timestamp: "2026-01-01T00:00:00Z",
            locale: "en-US",
            reason,
        },
    };
}

export interface AskStub {
    (options: AskOpenAIOptions): Promise<AskOpenAIResult>;
    calls: AskOpenAIOptions[];
}

/** Records every call so tests can assert on the previous-response-id chain. */
export function stubAsk(
    respond: (options: AskOpenAIOptions) => Promise<AskOpenAIResult> | AskOpenAIResult,
): AskStub {
    const calls: AskOpenAIOptions[] = [];
    const stub = async (options: AskOpenAIOptions): Promise<AskOpenAIResult> => {
        calls.push(options);
        return await respond(options);
    };
    return Object.assign(stub, { calls });
}

export async function invoke(
    envelope: RequestEnvelope,
    askOpenAI: AskStub,
): Promise<ResponseEnvelope> {
    return await createSkill({ askOpenAI }).invoke(envelope);
}

/** The plain-text speech Alexa would render, with the `<speak>` wrapper removed. */
export function spokenText(response: ResponseEnvelope): string {
    const outputSpeech = response.response.outputSpeech;
    if (outputSpeech?.type !== "SSML") {
        return "";
    }
    return outputSpeech.ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "").trim();
}

export function repromptText(response: ResponseEnvelope): string {
    const outputSpeech = response.response.reprompt?.outputSpeech;
    if (outputSpeech?.type !== "SSML") {
        return "";
    }
    return outputSpeech.ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "").trim();
}
