import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import { Speech } from "../utils/Speech.ts";

/** Handles "Alexa, open My AI" and leaves the session open for a question. */
export const LaunchRequestHandler: RequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
    },

    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(Speech.welcome)
            .reprompt(Speech.welcomeReprompt)
            .getResponse();
    },
};
