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
    "claude-sonnet-4-20250514",
    "claude-opus-4-0-20250514",
    "claude-haiku-4-5-20251001",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
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
    exampleModels: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    docsUrl: "https://console.groq.com/docs",
  },
  {
    slug: "together",
    name: "Together AI",
    description: "Open-source model hosting",
    category: "cloud",
    defaultBaseUrl: "https://api.together.xyz/v1",
    exampleModels: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
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
    exampleModels: ["mistral-large-latest", "mistral-small-latest"],
    docsUrl: "https://docs.mistral.ai",
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    description: "Search-augmented models",
    category: "cloud",
    defaultBaseUrl: "https://api.perplexity.ai",
    exampleModels: [
      "sonar-pro",
      "sonar",
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
    exampleModels: ["command-r-plus", "command-r"],
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
