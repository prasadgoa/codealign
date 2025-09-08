// Configuration for app branding and customization
export interface BrandingConfig {
  appName: string;
  companyName: string;
  assistantName: string;
  documentLibraryName: string;
  knowledgeBaseName: string;
  tagline: string;
  promptDescription: string;
  askAssistantText: string;
  primaryDomain: string; // e.g., "fire safety", "compliance", etc.
}

// Default configuration for Fire Department
export const defaultBranding: BrandingConfig = {
  appName: "Marshal",
  companyName: "GoAlign", 
  assistantName: "Marshal",
  documentLibraryName: "Knowledge Base",
  knowledgeBaseName: "Knowledge Base",
  tagline: "Compliance Command Center",
  promptDescription: "Ask me anything about fire safety codes, building regulations, zoning requirements, or compliance questions. I'll search through your documents and provide expert guidance.",
  askAssistantText: "Ask Marshal",
  primaryDomain: "fire safety",
};

// Get current branding config (can be extended to load from API/config file)
export const getBrandingConfig = (): BrandingConfig => {
  // For now, return default. In future, this could load from:
  // - Environment variables
  // - API endpoint
  // - Local config file
  // - Database
  return defaultBranding;
};