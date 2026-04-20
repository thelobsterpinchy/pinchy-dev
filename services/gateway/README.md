# services/gateway

Unified model gateway for local-first LLM onboarding.

## Goals
- discover and register local providers
- expose OpenAI-compatible API surface
- route by capabilities and policy
- collect latency, token, and error metrics

## Initial provider targets
- Ollama
- LM Studio
- vLLM
- llama.cpp server
- OpenAI-compatible custom endpoints

## Suggested API surface
- `GET /providers`
- `POST /providers`
- `GET /models`
- `POST /chat/completions`
- `POST /responses`

## Example provider config

```json
{
  "name": "local-ollama",
  "type": "ollama",
  "baseUrl": "http://localhost:11434",
  "models": ["qwen2.5-coder:32b", "deepseek-coder:latest"]
}
```
