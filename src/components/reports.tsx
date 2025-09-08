import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, TrendingUp, Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Reports() {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Reports</h2>
          <p className="text-gray-600 mb-6">
            Generate comprehensive reports for compliance, incidents, and operational analysis
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-2">Coming Soon</h3>
            <p className="text-green-700">
              Access detailed reports including incident summaries, compliance audits, 
              training records, and performance metrics with export capabilities.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Incident Reports</CardTitle>
              </div>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
            <CardDescription>
              Monthly and annual incident summaries with trends analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Compliance Reports</CardTitle>
              </div>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
            <CardDescription>
              Fire safety inspections, code violations, and remediation tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Training Records</CardTitle>
              </div>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
            <CardDescription>
              Personnel certifications, training completions, and requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Performance Metrics</CardTitle>
              </div>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
            <CardDescription>
              Response times, resource utilization, and departmental KPIs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}