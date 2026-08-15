import * as Alexa from "ask-sdk-core";
import type { CustomSkillBuilder, LambdaHandler, Skill } from "ask-sdk-core";
import { LaunchRequestHandler } from "./handlers/LaunchRequestHandler.ts";
import type { AskOpenAIIntentHandlerDeps } from "./handlers/AskOpenAIIntentHandler.ts";
import { createAskOpenAIIntentHandler } from "./handlers/AskOpenAIIntentHandler.ts";
import { NewConversationIntentHandler } from "./handlers/NewConversationIntentHandler.ts";
import { HelpIntentHandler } from "./handlers/HelpIntentHandler.ts";
import { CancelAndStopIntentHandler } from "./handlers/CancelAndStopIntentHandler.ts";
import { PrivacyIntentHandler } from "./handlers/PrivacyIntentHandler.ts";
import { FallbackIntentHandler } from "./handlers/FallbackIntentHandler.ts";
import { SessionEndedRequestHandler } from "./handlers/SessionEndedRequestHandler.ts";
import { ErrorHandler } from "./handlers/ErrorHandler.ts";
import { askOpenAI } from "./services/OpenAIService.ts";

/**
 * Handler order matters: each built-in matches only its own intent, and the
 * fallback handler is registered last so it never shadows a real intent.
 *
 * The OpenAI dependency is injectable so tests can drive the real Alexa request
 * pipeline against a stub instead of the live API.
 */
function buildSkill(deps: AskOpenAIIntentHandlerDeps): CustomSkillBuilder {
    return Alexa.SkillBuilders.custom()
        .addRequestHandlers(
            LaunchRequestHandler,
            NewConversationIntentHandler,
            HelpIntentHandler,
            CancelAndStopIntentHandler,
            PrivacyIntentHandler,
            createAskOpenAIIntentHandler(deps),
            FallbackIntentHandler,
            SessionEndedRequestHandler,
        )
        .addErrorHandlers(ErrorHandler);
}

export function createSkill(deps: AskOpenAIIntentHandlerDeps = { askOpenAI }): Skill {
    return buildSkill(deps).create();
}

/** AWS Lambda entry point — configure the function handler as `index.handler`. */
export const handler: LambdaHandler = buildSkill({ askOpenAI }).lambda();
