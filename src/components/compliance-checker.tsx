import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ComplianceResult {
  answer: string;
  found_chunks: number;
  query: string;
  status: string;
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
          query: data.query,
          status: data.status
        });
        console.log('Result set:', result); 
        toast({
          title: "Analysis Complete",
          description: `Found ${data.found_chunks} relevant document sections.`,
        });
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Compliance check error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unable to analyze compliance. Please try again.",
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
            Compliance Document Query
          </CardTitle>
          <CardDescription>
            Ask questions about compliance requirements based on your uploaded documents. The system will search through your document library to provide relevant answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ask a compliance question... (e.g., 'What are the fire safety requirements for commercial buildings?', 'What is the minimum door width for accessibility?', 'What are the parking space requirements?')"
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
                  Searching...
                </>
              ) : (
                'Search Documents'
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
                Search Results
              </CardTitle>
              <Badge variant="outline" className="text-sm">
                {result.found_chunks} documents found
              </Badge>
            </div>
            <CardDescription>
              Answer based on your uploaded compliance documents
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
                Answer:
              </h4>
              <p className="text-foreground leading-relaxed">{result.answer}</p>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <span>Source: {result.found_chunks} relevant document section{result.found_chunks !== 1 ? 's' : ''} analyzed</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
