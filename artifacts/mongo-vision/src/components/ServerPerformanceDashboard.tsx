import { useState, useEffect, useRef } from "react";
import { useGetServerStats, getGetServerStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Database, Server, Clock, HardDrive, Zap, Loader2, ArrowRight
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";

interface ServerPerformanceDashboardProps {
  connectionId: string;
}

export function ServerPerformanceDashboard({ connectionId }: ServerPerformanceDashboardProps) {
  const { data, isLoading, isError, error, refetch } = useGetServerStats(connectionId, {
    query: {
      queryKey: getGetServerStatsQueryKey(connectionId),
      refetchInterval: 2000,
    }
  });

  const [chartData, setChartData] = useState<{
    time: string;
    Query: number;
    Insert: number;
    Update: number;
    Delete: number;
  }[]>([]);

  const prevOpcounters = useRef<{
    query: number;
    insert: number;
    update: number;
    delete: number;
  } | null>(null);

  const prevTime = useRef<number | null>(null);

  useEffect(() => {
    if (!data?.opcounters) return;

    const current = data.opcounters as Record<string, number>;
    const now = Date.now();
    const elapsed = prevTime.current ? (now - prevTime.current) / 1000 : 2;
    prevTime.current = now;

    if (prevOpcounters.current) {
      const qDiff = Math.max(0, (current.query || 0) - (prevOpcounters.current.query || 0));
      const iDiff = Math.max(0, (current.insert || 0) - (prevOpcounters.current.insert || 0));
      const uDiff = Math.max(0, (current.update || 0) - (prevOpcounters.current.update || 0));
      const dDiff = Math.max(0, (current.delete || 0) - (prevOpcounters.current.delete || 0));

      // Calculate operations per second
      const qOps = Math.round(qDiff / elapsed);
      const iOps = Math.round(iDiff / elapsed);
      const uOps = Math.round(uDiff / elapsed);
      const dOps = Math.round(dDiff / elapsed);

      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      setChartData((prev) => {
        const next = [...prev, { time: timeStr, Query: qOps, Insert: iOps, Update: uOps, Delete: dOps }];
        if (next.length > 20) next.shift();
        return next;
      });
    }

    prevOpcounters.current = {
      query: current.query || 0,
      insert: current.insert || 0,
      update: current.update || 0,
      delete: current.delete || 0,
    };
  }, [data]);

  // Format Uptime
  const formatUptime = (seconds?: number) => {
    if (!seconds) return "—";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.join(" ") || `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-sans">Connecting and gathering server statistics...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
        <div className="max-w-md p-5 rounded-lg border border-red-500/25 bg-red-500/10 text-center space-y-3">
          <Activity className="w-10 h-10 text-red-500 mx-auto" />
          <h3 className="font-semibold text-foreground text-sm">Failed to Load Server Metrics</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {error instanceof Error ? error.message : "Ensure your database server is running and admin commands are allowed."}
          </p>
          <Button size="sm" onClick={() => void refetch()} className="h-8 text-xs font-mono">
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  const host = data?.host || "localhost";
  const version = data?.version || "—";
  const uptime = formatUptime(data?.uptime);
  const connActive = data?.connections?.current || 0;
  const connAvail = data?.connections?.available || 0;
  const connTotal = connActive + connAvail;
  const connPct = connTotal > 0 ? (connActive / connTotal) * 100 : 0;

  const memResident = data?.memory?.resident || 0;
  const memVirtual = data?.memory?.virtual || 0;

  // Calculate current total ops/sec from last chart data entry
  const lastTick = chartData[chartData.length - 1];
  const currentTotalOps = lastTick ? lastTick.Query + lastTick.Insert + lastTick.Update + lastTick.Delete : 0;

  return (
    <div className="flex-1 overflow-auto bg-background/50 p-6 space-y-6 flex flex-col min-h-0">
      {/* Dashboard Top Header */}
      <div className="flex items-center justify-between border-b border-border/65 pb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold font-mono tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Server Telemetry Dashboard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Host: <span className="text-foreground font-semibold">{host}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Clock className="w-3.5 h-3.5" /> Uptime: <span className="text-foreground font-bold">{uptime}</span>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/25 uppercase text-[10px] tracking-wide font-mono px-2 animate-pulse gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live Polling
          </Badge>
        </div>
      </div>

      {/* Stats Widgets Rows */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        {/* Connection Widget */}
        <div className="border border-border rounded-lg bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium font-sans uppercase tracking-wider">Client Connections</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono">{connActive}</span>
            <span className="text-xs text-muted-foreground">/ {connTotal} slots</span>
          </div>
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full" style={{ width: `${connPct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono text-right">{connAvail} available</p>
          </div>
        </div>

        {/* Memory Footprint Widget */}
        <div className="border border-border rounded-lg bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium font-sans uppercase tracking-wider">RAM Footprint</span>
            <HardDrive className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono">{memResident}</span>
            <span className="text-xs text-muted-foreground font-sans">MB resident</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Virtual Memory: <span className="text-foreground font-semibold">{memVirtual} MB</span>
          </div>
        </div>

        {/* Throughput Widget */}
        <div className="border border-border rounded-lg bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium font-sans uppercase tracking-wider">Throughput</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono">{currentTotalOps}</span>
            <span className="text-xs text-muted-foreground">ops/sec</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Sum of reads, inserts, updates, deletes
          </div>
        </div>

        {/* Version Widget */}
        <div className="border border-border rounded-lg bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium font-sans uppercase tracking-wider">Engine Info</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono">{version}</span>
            <span className="text-xs text-muted-foreground">v-release</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Total databases: <span className="text-foreground font-semibold">{data?.databases?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* Real-time Operation Rates Chart */}
      <div className="border border-border rounded-lg bg-card/25 p-5 space-y-3 flex-1 min-h-[300px] flex flex-col">
        <div className="shrink-0">
          <h3 className="text-sm font-semibold font-mono tracking-tight text-foreground">
            Real-Time Operations Rate (ops/sec)
          </h3>
          <p className="text-[10px] text-muted-foreground font-sans">Updated live every 2 seconds</p>
        </div>
        <div className="flex-1 w-full min-h-0">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-sans">
              Waiting for telemetry data points...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorQuery" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorInsert" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorUpdate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorDelete" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "rgba(9, 9, 11, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                <Area type="monotone" dataKey="Query" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorQuery)" />
                <Area type="monotone" dataKey="Insert" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorInsert)" />
                <Area type="monotone" dataKey="Update" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#colorUpdate)" />
                <Area type="monotone" dataKey="Delete" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorDelete)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Databases Listings list */}
      {data?.databases && data.databases.length > 0 && (
        <div className="border border-border rounded-lg bg-card/25 p-5 space-y-3 shrink-0">
          <h3 className="text-sm font-semibold font-mono tracking-tight text-foreground flex items-center gap-1.5">
            <Database className="w-4 h-4 text-emerald-400" />
            Databases Listing ({data.databases.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.databases.map((db) => (
              <div key={db} className="flex items-center gap-2 p-2.5 rounded border border-border/40 bg-card/30 hover:border-border/80 transition-colors font-mono text-xs select-none">
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="truncate flex-1 font-medium">{db}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
