import * as Alexa from "ask-sdk-core";
import type { ErrorHandler as AlexaErrorHandler } from "ask-sdk-core";
import { OpenAITimeoutError } from "../services/OpenAIService.ts";
import { describeError, logger } from "../utils/Logging.ts";
import { Speech } from "../utils/Speech.ts";

/**
 * Catch-all for anything a request handler did not deal with, including
 * malformed Alexa requests and unrouted intents.
 */
export const ErrorHandler: AlexaErrorHandler = {
    canHandle() {
        return true;
    },

    handle(handlerInput, error) {
        // Reading the request type can itself throw on a malformed envelope.
        let requestType: string | undefined;
        let intentName: string | undefined;
        try {
            requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
            if (requestType === "IntentRequest") {
                intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
            }
        } catch {
            requestType = "unknown";
        }

        logger.error("UnhandledError", {
            requestType,
            intentName,
            ...describeError(error),
        });

        const spoken = error instanceof OpenAITimeoutError ? Speech.timeout : Speech.genericError;

        // Keep the microphone open unless Alexa already closed the session.
        if (requestType === "SessionEndedRequest") {
            return handlerInput.responseBuilder.getResponse();
        }

        return handlerInput.responseBuilder
            .speak(spoken)
            .reprompt(Speech.welcomeReprompt)
            .getResponse();
    },
};
