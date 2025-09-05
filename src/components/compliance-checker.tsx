import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Loader2, FileText, Hash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

interface ComplianceSource {
  reference?: string;
  document: string;
  page?: number;
  section?: string;
  chunk_index?: number;
  relevance_score?: string;
  rerank_relevance?: string;
  vector_score?: string;
  excerpt: string;
}

interface ComplianceResult {
  answer: string;
  found_chunks?: number;
  chunks_analyzed?: number;
  chunks_used?: number;
  query: string;
  status: string;
  sources?: ComplianceSource[];
  enhancement_info?: {
    reranker_used?: boolean;
    dynamic_selection?: boolean;
    enhanced_prompting?: boolean;
  };
}

export function ComplianceChecker() {
  const [description, setDescription] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const { toast } = useToast();

  const handleCheck = async () => {
    if (!description.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a property description to check compliance.",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    
    try {
      const response = await fetch('http://35.209.113.236:3001/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: description
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setResult({
          answer: data.answer,
          found_chunks: data.found_chunks,
          chunks_analyzed: data.chunks_analyzed,
          chunks_used: data.chunks_used,
          query: data.query,
          status: data.status,
          sources: data.sources,
          enhancement_info: data.enhancement_info
        });
        console.log('Result set:', result); 
        toast({
          title: "Response Ready",
          description: `I analyzed ${data.chunks_analyzed || data.found_chunks} sources to answer your question.`,
        });
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Compliance check error:', error);
      toast({
        title: "Sorry, I couldn't help",
        description: error instanceof Error ? error.message : "I'm having trouble right now. Please try asking again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">
            Ask Your Compliance Assistant
          </CardTitle>
          <CardDescription>
            Ask me anything about fire safety codes, building regulations, zoning requirements, or compliance questions. I'll search through your documents and provide expert guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ask me a question... (e.g., 'What are the fire safety requirements for commercial buildings?', 'Can I build an ADU in this zone?', 'What's the minimum egress width for this occupancy?')"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[150px] resize-none border-border/50 focus:border-primary transition-all"
          />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {description.length} characters
            </span>
            <Button 
              onClick={handleCheck}
              disabled={isChecking}
              size="lg"
              className="min-w-[140px]"
            >
              {isChecking ? (
                <>
                  <Loader2 className="animate-spin" />
                  Thinking...
                </>
              ) : (
                'Ask Assistant'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="shadow-medium border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-accent" />
                Assistant Response
              </CardTitle>
              <Badge variant="outline" className="text-sm">
                {result.found_chunks} documents found
              </Badge>
            </div>
            <CardDescription>
              My response based on your compliance documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-card border border-border/50">
              <h4 className="font-semibold text-foreground mb-2">Question:</h4>
              <p className="text-sm text-muted-foreground">{result.query}</p>
            </div>
            
            <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
              <h4 className="font-semibold text-accent mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                My Response:
              </h4>
              <div className="text-foreground leading-relaxed">
                <ReactMarkdown
                  components={{
                    p: ({children}) => <p className="mb-2">{children}</p>,
                    ul: ({children}) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                    li: ({children}) => <li>{children}</li>,
                    strong: ({children}) => <strong className="font-semibold text-accent">{children}</strong>,
                  }}
                >
                  {result.answer}
                </ReactMarkdown>
              </div>
            </div>
            
            {result.sources && result.sources.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">Sources I Referenced:</h4>
                <div className="space-y-2">
                  {result.sources.map((source, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {source.reference && (
                            <Badge variant="default" className="text-xs font-semibold">
                              {source.reference}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {source.document}
                          </Badge>
                          {source.page && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              Page {source.page}
                            </Badge>
                          )}
                          {source.section && (
                            <Badge variant="outline" className="text-xs">
                              Section {source.section}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic">
                        "{source.excerpt}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground pt-2 border-t border-border/50">
              <span>Total: {result.found_chunks} relevant document section{result.found_chunks !== 1 ? 's' : ''} analyzed</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
