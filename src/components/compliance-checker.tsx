import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ComplianceResult {
  isCompliant: boolean;
  violations: string[];
  compliantAspects: string[];
  overallScore: number;
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
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock result
    const mockResult: ComplianceResult = {
      isCompliant: Math.random() > 0.5,
      violations: [
        "Exit door width does not meet minimum 32-inch requirement",
        "Missing accessible parking spaces as per ADA requirements",
        "Stairway riser height exceeds maximum 7.75 inches"
      ],
      compliantAspects: [
        "Fire alarm system meets NFPA 72 standards",
        "Sprinkler system coverage is adequate",
        "Emergency lighting complies with IBC requirements"
      ],
      overallScore: 75
    };
    
    setResult(mockResult);
    setIsChecking(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-accent';
    if (score >= 60) return 'text-yellow-600';
    return 'text-destructive';
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">
            Property Description Analysis
          </CardTitle>
          <CardDescription>
            Enter a detailed description of your property, building, or room to check compliance against applicable codes and standards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter detailed property description here... (e.g., 'Two-story commercial building with retail space on ground floor, office space on second floor. Main entrance has a 30-inch door, parking lot has 20 spaces with 1 accessible space...')"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[200px] resize-none border-border/50 focus:border-primary transition-all"
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
                  Analyzing...
                </>
              ) : (
                'Check Compliance'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={`shadow-medium border-l-4 ${
          result.isCompliant 
            ? 'border-l-accent bg-gradient-to-r from-accent/5 to-transparent' 
            : 'border-l-destructive bg-gradient-to-r from-destructive/5 to-transparent'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {result.isCompliant ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-accent" />
                    Compliant
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-destructive" />
                    Non-Compliant
                  </>
                )}
              </CardTitle>
              <Badge variant="outline" className={`text-lg font-semibold ${getScoreColor(result.overallScore)}`}>
                {result.overallScore}% Score
              </Badge>
            </div>
            <CardDescription>
              Compliance analysis results based on current code documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {result.violations.length > 0 && (
              <div>
                <h4 className="font-semibold text-destructive mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Code Violations ({result.violations.length})
                </h4>
                <div className="space-y-2">
                  {result.violations.map((violation, index) => (
                    <div key={index} className="p-3 rounded-md bg-destructive/5 border border-destructive/20">
                      <p className="text-sm text-foreground">{violation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.compliantAspects.length > 0 && (
              <div>
                <h4 className="font-semibold text-accent mb-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Compliant Aspects ({result.compliantAspects.length})
                </h4>
                <div className="space-y-2">
                  {result.compliantAspects.map((aspect, index) => (
                    <div key={index} className="p-3 rounded-md bg-accent/5 border border-accent/20">
                      <p className="text-sm text-foreground">{aspect}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}