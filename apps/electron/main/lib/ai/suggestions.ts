import OpenAI from "openai";
import log from "electron-log";

/**
 * Default suggestions when generation fails or no API key is available.
 */
export const DEFAULT_SUGGESTIONS = [
  "Create spreadsheet",
  "Visualize data",
  "Generate chart",
  "Analyze trends",
];

/**
 * Generates follow-up suggestions based on the last message and chat history.
 * Uses a fast/cheap model (gpt-4o-mini or GLM-4.7-Flash) for quick generation.
 */
export async function generateSuggestions(
  lastMessage: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  apiKey: string,
  baseURL?: string,
): Promise<string[]> {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    // Choose a fast/cheap model based on the provider
    // If baseURL is Z.AI, use GLM-4.7-Flash
    // Otherwise use gpt-4o-mini
    const model =
      baseURL && baseURL.includes("z.ai") ? "GLM-4.7-Flash" : "gpt-4o-mini";

    log.info(
      `[AI] Generating suggestions with model: ${model}, baseURL: ${baseURL || "default"}`,
    );

    // Z.AI models (GLM) sometimes struggle with response_format: json_object
    // and require explicit instructions in the system prompt.
    const isZai = baseURL && baseURL.includes("z.ai");

    // Truncate lastMessage if too long (keep first 2000 chars)
    const truncatedLastMessage =
      lastMessage.length > 2000
        ? lastMessage.slice(0, 2000) + "..."
        : lastMessage;

    // Build context from recent history (last 3 user messages)
    const recentUserMessages = history
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content.slice(0, 200))
      .join(" | ");

    // Detect language from the response - simple heuristic based on common Spanish words
    // Use distinctive Spanish words that don't appear in English
    const spanishIndicators =
      /\b(el|la|los|las|del|al|que|qué|en|un|una|unos|unas|es|son|está|están|fue|fueron|ser|estar|por|para|como|cómo|pero|más|este|esta|estos|estas|ese|esa|esos|esas|tiene|tienen|puede|pueden|hacer|hacen|aquí|allí|también|sobre|cuando|cuándo|todo|toda|todos|todas|hay|muy|ahora|entre|bien|sin|aunque|donde|dónde|desde|cada|porque|porqué|tiempo|mismo|después|durante|antes|mejor|peor|sido|hacia|otra|otras|otro|otros|cuál|quién|quiénes|cuánto|cuántos|ya|así|sólo|solo|aún|todavía|mientras|siempre|nunca|nada|nadie|algo|alguien|mucho|poco|bastante|demasiado|varios|algunas|ningún|ninguna|además|entonces|luego|después|primero|segundo|tercero|último|siguiente|anterior|nuevo|nueva|bueno|buena|malo|mala|grande|pequeño|pequeña)\b/gi;

    // Use distinctive English words
    const englishIndicators =
      /\b(the|is|are|was|were|have|has|had|been|will|would|could|should|can|may|might|must|shall|this|that|these|those|with|from|about|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|what|which|who|whom|whose|all|each|few|more|most|other|some|such|only|same|than|very|just|also|now|even|both|well|still|much|many|any|however|therefore|although|because|since|while|whereas|whether|unless|until|though|already|always|never|often|sometimes|usually|perhaps|maybe|certainly|probably|definitely|actually|really|quite|rather|pretty|enough|too|almost|nearly|hardly|barely|either|neither|both|another|every|several|certain|various|particular|specific|different|similar|important|necessary|possible|available|following|including|according|regarding)\b/gi;

    const spanishMatches = truncatedLastMessage.match(spanishIndicators) || [];
    const englishMatches = truncatedLastMessage.match(englishIndicators) || [];
    const spanishCount = spanishMatches.length;
    const englishCount = englishMatches.length;

    // More aggressive Spanish detection: if Spanish words are >= 30% of English, use Spanish
    // This ensures that Spanish content isn't drowned out by common English words
    const detectedLanguage =
      spanishCount >= 5 || (spanishCount > 0 && spanishCount >= englishCount * 0.3)
        ? "Spanish"
        : "English";

    log.info(
      `[AI] Detected language: ${detectedLanguage} (es:${spanishCount}, en:${englishCount})`,
    );

    // Build language-specific system prompt
    const systemPrompt =
      detectedLanguage === "Spanish"
        ? `Eres un generador de sugerencias de seguimiento para un chat.

REGLAS CRÍTICAS:
- Genera EXACTAMENTE 5 sugerencias EN ESPAÑOL
- PROHIBIDO usar inglés - todas las sugerencias DEBEN ser en español
- Cada sugerencia: máximo 2-5 palabras
- Las sugerencias deben relacionarse con el contenido de la respuesta
- Sé específico, no genérico
- Devuelve SOLO JSON válido: {"suggestions": ["...", "...", "...", "...", "..."]}

${isZai ? "IMPORTANTE: Devuelve solo JSON válido, sin texto adicional." : ""}`
        : `You generate follow-up suggestions for a chat assistant.

CRITICAL RULES:
- Generate EXACTLY 5 suggestions IN ENGLISH
- Each suggestion: 2-5 words maximum
- Suggestions must relate to the assistant's response content
- Be specific, not generic
- Return ONLY valid JSON: {"suggestions": ["...", "...", "...", "...", "..."]}

${isZai ? "IMPORTANT: Return valid JSON only, no extra text." : ""}`;

    const userPrompt =
      detectedLanguage === "Spanish"
        ? `Respuesta del asistente:
"""
${truncatedLastMessage}
"""

${recentUserMessages ? `Contexto del usuario: ${recentUserMessages}\n\n` : ""}Genera 5 sugerencias de seguimiento EN ESPAÑOL.
IMPORTANTE: Escribe las sugerencias EN ESPAÑOL, NO en inglés.

Devuelve SOLO: {"suggestions": ["sugerencia1", "sugerencia2", "sugerencia3", "sugerencia4", "sugerencia5"]}`
        : `Assistant's response:
"""
${truncatedLastMessage}
"""

${recentUserMessages ? `User context: ${recentUserMessages}\n\n` : ""}Generate 5 follow-up suggestions IN ENGLISH.

Return ONLY: {"suggestions": ["...", "...", "...", "...", "..."]}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      // Only use response_format for OpenAI, for Z.AI rely on prompt
      ...(isZai ? {} : { response_format: { type: "json_object" } }),
      max_tokens: 200,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warn("[AI] Suggestions response content is empty");
      return DEFAULT_SUGGESTIONS;
    }

    log.info(`[AI] Suggestions raw content: ${content}`);

    try {
      const parsed = JSON.parse(content);
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : Object.values(parsed)[0];

      if (Array.isArray(suggestions)) {
        const filtered = suggestions
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter(Boolean)
          .filter((s) => s.length <= 30) // Filter out suggestions that are too long
          .slice(0, 5); // Now return up to 5 suggestions

        if (filtered.length === 0) {
          log.warn("[AI] No valid suggestions after filtering");
          return DEFAULT_SUGGESTIONS;
        }

        log.info(
          `[AI] Generated ${filtered.length} suggestions: ${filtered.join(", ")}`,
        );
        return filtered;
      }
    } catch (parseError) {
      log.error("[AI] Failed to parse suggestions JSON:", content, parseError);
    }

    log.warn("[AI] Using fallback suggestions");
    return DEFAULT_SUGGESTIONS;
  } catch (error) {
    log.error("[AI] Error generating suggestions:", error);
    return DEFAULT_SUGGESTIONS;
  }
}
