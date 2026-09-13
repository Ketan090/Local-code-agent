import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3101', 10),
  lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
  lmStudioApiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL || 'http://127.0.0.1:4096',
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  unoKey: process.env.UNO_API_KEY || '',
  xkiroBaseUrl: process.env.XKIRO_BASE_URL || 'https://api.xkiro.com/v1',
  xkiroApiKey: process.env.XKIRO_API_KEY || '',
  provider: process.env.PROVIDER || 'lmstudio',
  defaultModel: process.env.DEFAULT_MODEL || '',
  maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '30', 10),
  workspaceRoot: process.env.WORKSPACE_ROOT || '',
  temperature: parseFloat(process.env.TEMPERATURE || '0.2'),
  maxTokens: parseInt(process.env.MAX_TOKENS || '4096', 10),
  contextLength: parseInt(process.env.CONTEXT_LENGTH || '8192', 10),
  streaming: process.env.STREAMING !== 'false',
  autoConnect: process.env.AUTO_CONNECT !== 'false',
};
