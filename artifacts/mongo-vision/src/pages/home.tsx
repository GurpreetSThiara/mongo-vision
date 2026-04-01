import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useListConnections, useDeleteConnection, getListConnectionsQueryKey, useTestConnection } from "@workspace/api-client-react";
import { Database, Plus, Trash2, Activity, Clock, Server, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useListConnections();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const connections = data?.connections || [];

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await deleteConnection.mutateAsync({ connectionId: id });
      queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      toast({ title: "Connection deleted" });
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
  };

  const handleTest = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await testConnection.mutateAsync({ connectionId: id });
      if (res.success) {
        toast({ title: "Connection successful", description: `Latency: ${res.latencyMs}ms` });
        queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      } else {
        toast({ title: "Connection failed", description: res.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold font-mono tracking-tight">MongoVision</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/connect">
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Connection
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12 max-w-6xl mx-auto w-full">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Connections</h2>
          <p className="text-muted-foreground mt-2">Manage your MongoDB database connections.</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 border border-dashed border-border rounded-lg bg-card/50">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Server className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              Add your first MongoDB connection string to start exploring your databases, collections, and documents.
            </p>
            <Link href="/connect">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Connection
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connections.map((conn) => (
              <Card 
                key={conn.id} 
                className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group flex flex-col"
                onClick={() => setLocation(`/explorer/${conn.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg truncate pr-2">{conn.name}</CardTitle>
                    <Badge variant={conn.status === "connected" ? "default" : conn.status === "error" ? "destructive" : "secondary"}>
                      {conn.status}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs truncate" title={`${conn.host}:${conn.port}`}>
                    {conn.host}:{conn.port}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="pb-4 flex-1">
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {conn.lastUsed 
                          ? `Used ${formatDistanceToNow(new Date(conn.lastUsed), { addSuffix: true })}` 
                          : "Never used"}
                      </span>
                    </div>
                    {conn.mongoVersion && (
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span>MongoDB {conn.mongoVersion}</span>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="bg-muted/30 pt-4 flex justify-between items-center border-t border-border">
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => handleTest(conn.id, e)}
                      title="Test Connection"
                    >
                      <Activity className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(conn.id, e)}
                      title="Delete Connection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-2 group-hover:text-primary transition-colors">
                    Connect <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
