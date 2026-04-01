import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateConnection, useTestConnection, getListConnectionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Database, ArrowLeft, CheckCircle, XCircle, Loader2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Connect() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [uri, setUri] = useState("mongodb://localhost:27017");
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; mongoVersion?: string; message?: string } | null>(null);
  const createConnection = useCreateConnection();
  const testConnection = useTestConnection();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTest = async () => {
    if (!uri) return;
    setTestResult(null);

    try {
      const tempId = "test-" + Date.now();
      const created = await createConnection.mutateAsync({ data: { name: name || "Test", uri } });
      const result = await testConnection.mutateAsync({ connectionId: created.id });
      setTestResult(result);
      if (!result.success) {
        await import("@workspace/api-client-react").then(m => {});
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection failed" });
    }
  };

  const handleConnect = async () => {
    if (!name || !uri) {
      toast({ title: "Name and URI are required", variant: "destructive" });
      return;
    }

    try {
      const conn = await createConnection.mutateAsync({ data: { name, uri } });
      queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      toast({ title: "Connected!", description: `Connected to ${conn.host}` });
      setLocation(`/explorer/${conn.id}`);
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border flex items-center px-6 bg-card">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold font-mono tracking-tight">MongoVision</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2 mb-4 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                Back to connections
              </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">New Connection</h2>
            <p className="text-muted-foreground mt-2">Connect to any MongoDB instance using a URI string.</p>
          </div>

          <div className="border border-border rounded-xl bg-card p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="conn-name" data-testid="label-name">Connection Name</Label>
              <Input
                id="conn-name"
                data-testid="input-name"
                placeholder="My Database"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conn-uri" data-testid="label-uri">MongoDB URI</Label>
              <Input
                id="conn-uri"
                data-testid="input-uri"
                placeholder="mongodb://localhost:27017"
                value={uri}
                onChange={(e) => { setUri(e.target.value); setTestResult(null); }}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Supports: mongodb://, mongodb+srv://, with or without credentials
              </p>
            </div>

            {testResult && (
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${testResult.success ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                    {testResult.success ? "Connection successful" : "Connection failed"}
                  </p>
                  {testResult.success && testResult.latencyMs !== undefined && (
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">
                        {testResult.latencyMs}ms
                      </Badge>
                      {testResult.mongoVersion && (
                        <span className="text-xs text-muted-foreground">MongoDB {testResult.mongoVersion}</span>
                      )}
                    </div>
                  )}
                  {!testResult.success && (
                    <p className="text-xs text-red-300/70 mt-1 truncate">{testResult.message}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!uri || testConnection.isPending || createConnection.isPending}
                data-testid="button-test"
                className="gap-2"
              >
                {testConnection.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Test
              </Button>
              <Button
                onClick={handleConnect}
                disabled={!name || !uri || createConnection.isPending}
                data-testid="button-connect"
                className="flex-1 gap-2"
              >
                {createConnection.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                Connect
              </Button>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Quick connect examples</p>
              <div className="space-y-2">
                {[
                  { label: "Local", uri: "mongodb://localhost:27017" },
                  { label: "Atlas", uri: "mongodb+srv://<user>:<pass>@cluster.mongodb.net" },
                  { label: "With Auth", uri: "mongodb://admin:password@localhost:27017" },
                ].map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setUri(ex.uri)}
                    className="w-full text-left px-3 py-2 rounded-md bg-background border border-border hover:border-primary/50 transition-colors group"
                  >
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">{ex.label}: </span>
                    <span className="text-xs font-mono text-primary/70 group-hover:text-primary">{ex.uri}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
