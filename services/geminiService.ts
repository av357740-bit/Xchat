
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Message, GroundingChunk } from "../types";

// Note: API key is obtained directly from process.env.API_KEY in the function call

export const sendMessageToGemini = async (
  messages: Message[],
  options: { 
    deepSearch?: boolean; 
    thinking?: boolean;
    fileData?: { data: string; mimeType: string }[] 
  }
): Promise<{ text: string; groundingLinks?: GroundingChunk[] }> => {
  // Always use a new GoogleGenAI instance with process.env.API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Decide model based on mode: Thinking uses gemini-3-pro-preview, others use gemini-3-flash-preview
  const model = options.thinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

  // Use any[] for contents to bypass narrow type inference that prevents adding inlineData parts
  const contents: any[] = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  // Handle file parts for the last user message to enable multimodal capabilities
  if (options.fileData && options.fileData.length > 0 && contents.length > 0) {
    const lastContent = contents[contents.length - 1];
    options.fileData.forEach(file => {
      // Add inlineData part for images/files
      lastContent.parts.push({
        inlineData: {
          data: file.data.split(',')[1], // Remove base64 prefix (e.g., data:image/png;base64,)
          mimeType: file.mimeType
        }
      });
    });
  }

  const config: any = {
    temperature: options.thinking ? 1.0 : 0.9,
    topP: 0.95,
  };

  if (options.deepSearch) {
    // Enable Google Search grounding for up-to-date information
    config.tools = [{ googleSearch: {} }];
  }

  if (options.thinking) {
    // Configure thinking budget for complex reasoning tasks on supported models
    config.thinkingConfig = { thinkingBudget: 32768 };
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    // Access .text property directly (do not call as a method)
    const text = response.text || "I couldn't generate a response.";
    
    // Extract grounding chunks and cast to satisfy the local Message interface
    const groundingLinks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[]) || [];

    return {
      text,
      groundingLinks
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
