import type { Rule } from "../types.js";
import { authRules } from "./auth.js";
import { channelRules } from "./channels.js";
import { documentRules } from "./document.js";
import { extensionRules } from "./extensions.js";
import { oauthRules } from "./oauth.js";
import { transportRules } from "./transport.js";

/** Every rule, in report order. Rule ids are stable: CI configs and docs may refer to them. */
export const RULES: readonly Rule[] = [...transportRules, ...documentRules, ...channelRules, ...authRules, ...extensionRules, ...oauthRules];

export function ruleById(id: string): Rule | undefined {
    return RULES.find((rule) => rule.id === id);
}
