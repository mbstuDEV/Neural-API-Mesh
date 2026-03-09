import { InferenceRequest, InferenceResponse, ProviderAdapter } from '../types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { HuggingFaceProvider } from './providers/huggingface';
import { providers as providerConfigs } from '../config';
import { AppError } from '../middleware/errorHandler';
import { logger } from './logger';

// ── Build the provider registry ────────────────────────────────────────────

const adapters: ProviderAdapter[] = providerConfigs.map((cfg) => {
  switch (cfg.name) {
    case 'openai':      return new OpenAIProvider(cfg);
    case 'anthropic':   return new AnthropicProvider(cfg);
    case 'huggingface': return new HuggingFaceProvider(cfg);
    default:
      throw new Error(`Unknown provider: ${cfg.name}`);
  }
});

// ── Core dispatch ──────────────────────────────────────────────────────────

export async function dispatch(req: InferenceRequest): Promise<InferenceResponse> {
  // Find all providers that can serve this model
  const candidates = adapters.filter((a) => a.supports(req.model));

  if (candidates.length === 0) {
    throw new AppError(
      'MODEL_NOT_FOUND',
      `No configured provider supports model "${req.model}". Check your provider API keys and model list.`,
      400
    );
  }

  // Try each candidate in order — fallback on error
  const errors: { provider: string; message: string }[] = [];

  for (const provider of candidates) {
    try {
      logger.debug({ provider: provider.name, model: req.model }, 'Dispatching to provider');
      const response = await provider.call(req);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ provider: provider.name, model: req.model, message }, 'Provider call failed, trying fallback');
      errors.push({ provider: provider.name, message });
    }
  }

  // All providers failed
  throw new AppError(
    'ALL_PROVIDERS_FAILED',
    `All providers failed for model "${req.model}".`,
    502,
    errors
  );
}
