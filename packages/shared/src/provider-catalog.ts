export interface CatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: "cloud" | "local";
  defaultBaseUrl: string;
  exampleModels: string[];
  docsUrl?: string;
}

export const FIRST_PARTY_MODELS: Record<string, string[]> = {
  anthropic: [
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-3-5-haiku-20241022",
  ],
  openai: [
    "gpt-5.2-chat-latest",
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
  ],
  google: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
};

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  google:
    "https://generativelanguage.googleapis.com/v1beta/openai/",
};

export const providerCatalog: CatalogEntry[] = [
  // Cloud APIs
  {
    slug: "groq",
    name: "Groq",
    description: "Fast inference for open-source models",
    category: "cloud",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    exampleModels: [
      "openai/gpt-oss-120b",
      "groq/compound",
      "llama-3.3-70b-versatile",
    ],
    docsUrl: "https://console.groq.com/docs",
  },
  {
    slug: "together",
    name: "Together AI",
    description: "Open-source model hosting",
    category: "cloud",
    defaultBaseUrl: "https://api.together.xyz/v1",
    exampleModels: [
      "moonshotai/Kimi-K2-Instruct-0905",
      "deepseek-ai/DeepSeek-V3.1",
      "openai/gpt-oss-120b",
    ],
    docsUrl: "https://docs.together.ai",
  },
  {
    slug: "fireworks",
    name: "Fireworks AI",
    description: "Fast open-source model inference",
    category: "cloud",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    exampleModels: [
      "accounts/fireworks/models/deepseek-v3",
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
    ],
    docsUrl: "https://docs.fireworks.ai",
  },
  {
    slug: "mistral",
    name: "Mistral",
    description: "European AI models",
    category: "cloud",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    exampleModels: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "devstral-small-latest",
    ],
    docsUrl: "https://docs.mistral.ai",
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    description: "Search-augmented models",
    category: "cloud",
    defaultBaseUrl: "https://api.perplexity.ai",
    exampleModels: [
      "sonar",
      "sonar-pro",
      "sonar-reasoning-pro",
      "sonar-deep-research",
    ],
    docsUrl: "https://docs.perplexity.ai",
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    description: "Cost-effective reasoning models",
    category: "cloud",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    exampleModels: ["deepseek-chat", "deepseek-reasoner"],
    docsUrl: "https://platform.deepseek.com/docs",
  },
  {
    slug: "cohere",
    name: "Cohere",
    description: "Enterprise NLP models",
    category: "cloud",
    defaultBaseUrl: "https://api.cohere.com/v1",
    exampleModels: [
      "command-a-03-2025",
      "command-r-plus-08-2024",
      "command-r-08-2024",
    ],
    docsUrl: "https://docs.cohere.com",
  },
  // Local / Open Source
  {
    slug: "ollama",
    name: "Ollama",
    description: "Run models locally",
    category: "local",
    defaultBaseUrl: "http://localhost:11434/v1",
    exampleModels: ["llama3.3", "mistral", "codellama"],
    docsUrl: "https://ollama.com",
  },
  {
    slug: "lmstudio",
    name: "LM Studio",
    description: "Local model server",
    category: "local",
    defaultBaseUrl: "http://localhost:1234/v1",
    exampleModels: ["local-model"],
    docsUrl: "https://lmstudio.ai",
  },
  {
    slug: "vllm",
    name: "vLLM",
    description: "High-throughput serving",
    category: "local",
    defaultBaseUrl: "http://localhost:8000/v1",
    exampleModels: ["model"],
    docsUrl: "https://docs.vllm.ai",
  },
];
