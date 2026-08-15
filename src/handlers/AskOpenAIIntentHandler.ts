import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import type { AskOpenAIOptions, AskOpenAIResult } from "../services/OpenAIService.ts";
import { askOpenAI, OpenAITimeoutError } from "../services/OpenAIService.ts";
import type { SessionAttributes } from "../types/SessionAttributes.ts";
import { prepareSpeech } from "../utils/AlexaUtils.ts";
import { isPromptLoggingEnabled, logger, describeError } from "../utils/Logging.ts";
import { Speech } from "../utils/Speech.ts";

/**
 * Both intents carry the same `question` slot and are answered identically.
 *
 * `AskOpenAIIntent` uses AMAZON.SearchQuery, which Alexa only allows behind a
 * carrier phrase ("ask ...", "tell me ..."). `AskOpenAIFreeformIntent` uses a
 * custom catch-all slot type so a bare question with no carrier phrase still
 * reaches this handler. See the interaction model notes in the README.
 */
export const ASK_INTENT_NAMES = ["AskOpenAIIntent", "AskOpenAIFreeformIntent"];

export interface AskOpenAIIntentHandlerDeps {
    askOpenAI: (options: AskOpenAIOptions) => Promise<AskOpenAIResult>;
}

export function createAskOpenAIIntentHandler(
    deps: AskOpenAIIntentHandlerDeps,
): RequestHandler {
    return {
        canHandle(handlerInput) {
            return (
                Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
                ASK_INTENT_NAMES.includes(Alexa.getIntentName(handlerInput.requestEnvelope))
            );
        },

        async handle(handlerInput) {
            const question = Alexa.getSlotValue(handlerInput.requestEnvelope, "question")?.trim();

            if (!question) {
                logger.warn("MissingQuestionSlot", {
                    intentName: Alexa.getIntentName(handlerInput.requestEnvelope),
                });
                return handlerInput.responseBuilder
                    .speak(Speech.missingQuestion)
                    .reprompt(Speech.welcomeReprompt)
                    .getResponse();
            }

            if (isPromptLoggingEnabled()) {
                logger.debug("UserQuestion", { question });
            }

            const attributes =
                handlerInput.attributesManager.getSessionAttributes() as SessionAttributes;

            let result: AskOpenAIResult;
            try {
                result = await deps.askOpenAI({
                    prompt: question,
                    ...(attributes.previousOpenAIResponseId !== undefined && {
                        previousResponseId: attributes.previousOpenAIResponseId,
                    }),
                });
            } catch (error) {
                logger.error("AskOpenAIFailed", describeError(error));

                const spoken =
                    error instanceof OpenAITimeoutError ? Speech.timeout : Speech.genericError;

                // The session stays open so the user can simply try again.
                return handlerInput.responseBuilder
                    .speak(spoken)
                    .reprompt(Speech.welcomeReprompt)
                    .getResponse();
            }

            if (result.responseId) {
                attributes.previousOpenAIResponseId = result.responseId;
            } else {
                // Without an id the chain is broken; drop the stale one rather
                // than silently answering follow-ups against an old context.
                delete attributes.previousOpenAIResponseId;
            }
            handlerInput.attributesManager.setSessionAttributes(attributes);

            return handlerInput.responseBuilder
                .speak(prepareSpeech(result.text))
                .reprompt(Speech.followUpReprompt)
                .getResponse();
        },
    };
}

export const AskOpenAIIntentHandler = createAskOpenAIIntentHandler({ askOpenAI });
