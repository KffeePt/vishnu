import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Signal, ShieldAlert, Wifi, Zap, Activity, Map as MapIcon, Loader2 } from "lucide-react";
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from "@/config/firebase";
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { SentinelCoordinates } from "./sentinel-coordinates";

interface SentinelMonitorTabProps {
    employees?: any[];
}

export function SentinelMonitorTab({ employees = [] }: SentinelMonitorTabProps) {
    const [signals, setSignals] = useState<any>({});
    const [codebookInfo, setCodebookInfo] = useState<any>({});
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);

    const { getIDToken, userClaims } = UserAuth();
    const { toast } = useToast();

    const isOwner = userClaims?.owner === true;

    // Load Signals & Codebook
    useEffect(() => {
        const rtdb = getDatabase(app);
        // Listen to all signals
        const signalsRef = ref(rtdb, 'signals');
        const unsubscribeSignals = onValue(signalsRef, (snapshot) => {
            if (snapshot.exists()) {
                setSignals(snapshot.val());
            } else {
                setSignals({});
            }
        });

        // Listen to codebook
        const codebookRef = ref(rtdb, 'codebook/current');
        const unsubscribeCodebook = onValue(codebookRef, (snapshot) => {
            if (snapshot.exists()) {
                setCodebookInfo(snapshot.val());
            }
        });

        return () => {
            unsubscribeSignals();
            unsubscribeCodebook();
        };
    }, []);

    const fetchActivity = useCallback(async () => {
        setIsLoadingActivity(true);
        try {
            const token = await getIDToken();
            const res = await fetch('/api/admin/sentinel-activity', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setActivities(data.activities || []);
            } else {
                toast({ title: "Failed to load activity feed", variant: "destructive" });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoadingActivity(false);
        }
    }, [getIDToken, toast]);

    // Load activity on mount
    useEffect(() => {
        fetchActivity();
    }, [fetchActivity]);

    const getEmployeeName = (uid: string) => {
        const emp = employees.find(e => e.id === uid);
        return emp ? emp.name : uid.slice(0, 8) + '...';
    };

    const renderSignalList = (signalMap: Record<string, any>) => {
        if (!signalMap || Object.keys(signalMap).length === 0) return <div className="text-sm text-muted-foreground italic">No signals</div>;
        return (
            <div className="space-y-2">
                {Object.entries(signalMap).map(([id, data]) => (
                    <div key={id} className="p-2 border rounded text-xs bg-muted/30">
                        <div className="flex justify-between mb-1">
                            <Badge variant="outline" className="font-mono">{data.codeWord}</Badge>
                            <span className="text-muted-foreground">{new Date(data.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-1 text-muted-foreground">
                            <div><span className="font-semibold">ID:</span> {id.slice(-6)}</div>
                            {data.sender && <div><span className="font-semibold">Sender:</span> {getEmployeeName(data.sender)}</div>}
                            {data.consumed !== undefined && <div><span className="font-semibold">Consumed:</span> {data.consumed ? 'Yes' : 'No'}</div>}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6 pt-4">
            <div className="flex justify-between items-center bg-muted/30 p-4 rounded-xl border border-border/50">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Zap className="h-6 w-6 text-yellow-500" /> Sentinel System
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">Multi-vector security monitoring and tracking.</p>
                </div>
            </div>

            <Tabs defaultValue="signals" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="signals" className="flex items-center gap-2">
                        <Signal className="w-4 h-4" /> Signal Traffic
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Activity Feed
                    </TabsTrigger>
                    <TabsTrigger value="coordinates" className="flex items-center gap-2">
                        <MapIcon className="w-4 h-4" /> Live Coordinates
                    </TabsTrigger>
                </TabsList>

                {/* SIGNALS TAB */}
                <TabsContent value="signals" className="mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="md:col-span-1 shadow-sm">
                            <CardHeader className="bg-muted/20 border-b">
                                <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Codebook Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-4">
                                <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg border">
                                    <span className="font-semibold text-sm">Target Version:</span>
                                    <Badge variant="secondary" className="font-mono text-xs">v{codebookInfo.version || 0}</Badge>
                                </div>
                                <div className="flex justify-between items-center px-1">
                                    <span className="font-semibold text-xs text-muted-foreground">Last Cycle:</span>
                                    <span className="text-xs text-muted-foreground">
                                        {codebookInfo.rotatedAt ? new Date(codebookInfo.rotatedAt).toLocaleString() : 'Never'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2 shadow-sm">
                            <CardHeader className="bg-muted/20 border-b flex flex-row items-center justify-between py-3">
                                <CardTitle className="flex items-center gap-2 text-base"><Signal className="h-4 w-4" /> RTDB Traffic</CardTitle>
                                <Badge variant="outline" className="animate-pulse bg-green-500/10 text-green-600 border-green-500/20">Live</Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px] w-full">
                                    <div className="p-4">
                                        <Accordion type="multiple" defaultValue={["broadcast"]}>
                                            <AccordionItem value="broadcast" className="border rounded-lg mb-2 overflow-hidden shadow-sm">
                                                <AccordionTrigger className="font-semibold hover:bg-muted/50 px-3 py-2 bg-muted/20"><div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-blue-500" /> Broadcast Channel</div></AccordionTrigger>
                                                <AccordionContent className="p-3 bg-background">
                                                    {renderSignalList(signals.broadcast || {})}
                                                </AccordionContent>
                                            </AccordionItem>

                                            {Object.keys(signals).filter(k => k !== 'broadcast').map(uid => (
                                                <AccordionItem key={uid} value={uid} className="border rounded-lg mb-2 overflow-hidden shadow-sm">
                                                    <AccordionTrigger className="font-mono text-sm hover:bg-muted/50 px-3 py-2 bg-muted/20">Target: {getEmployeeName(uid)}</AccordionTrigger>
                                                    <AccordionContent className="p-3 bg-background">
                                                        {renderSignalList(signals[uid] || {})}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            ))}
                                        </Accordion>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ACTIVITY FEED TAB */}
                <TabsContent value="activity" className="mt-0">
                    <Card className="shadow-sm border-border/50">
                        <CardHeader className="bg-muted/20 border-b flex flex-row items-center justify-between py-3">
                            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> System Events</CardTitle>
                            <Button variant="ghost" size="sm" onClick={fetchActivity} disabled={isLoadingActivity} className="h-8">
                                <RefreshCw className={`h-3 w-3 mr-2 ${isLoadingActivity ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px] w-full">
                                {activities.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-2">
                                        <Activity className="h-8 w-8 opacity-20" />
                                        <p>No recent activity found.</p>
                                    </div>
                                ) : (
                                    <div className="p-4 relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-[27px] top-6 bottom-6 w-px bg-border"></div>

                                        <div className="space-y-6">
                                            {activities.map((item, i) => (
                                                <div key={item.id + i} className="flex gap-4 relative">
                                                    <div className={`mt-0.5 rounded-full p-1.5 ring-4 ring-background z-10 h-max
                                                        ${item.type === 'login' ? 'bg-blue-500/20 text-blue-600' : 'bg-green-500/20 text-green-600'}
                                                    `}>
                                                        {item.type === 'login' ? <ShieldAlert className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                                                    </div>
                                                    <div className="flex-1 border rounded-lg p-3 bg-card shadow-sm hover:shadow-md transition-shadow">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <div className="font-medium text-sm flex items-center gap-1.5">
                                                                {getEmployeeName(item.userId)}
                                                                <Badge variant="outline" className="text-[10px] px-1.5 h-4 tracking-tight uppercase">
                                                                    {item.type}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded border border-border/50 font-mono">
                                                            {item.type === 'login' ? (
                                                                <span>Auth Method: {item.details.authenticatedVia}</span>
                                                            ) : (
                                                                <span className="text-green-600 dark:text-green-500 font-medium">Recorded Sale Execution</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* COORDINATES TAB */}
                <TabsContent value="coordinates" className="mt-0">
                    <SentinelCoordinates employees={employees} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
